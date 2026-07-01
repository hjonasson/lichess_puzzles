use csv::StringRecord;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Instant, UNIX_EPOCH};
use tauri::Manager;
use zstd::stream::read::Decoder;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    product_name: String,
    app_version: String,
    app_data_dir: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PuzzlePayload {
    id: String,
    fen: String,
    moves: Vec<String>,
    rating: u32,
    themes: Vec<String>,
    opening_tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FeaturedPuzzleResponse {
    dataset_path: String,
    puzzle: PuzzlePayload,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionGameOption {
    id: String,
    label: String,
    count: usize,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionGameCategory {
    id: String,
    label: String,
    count: usize,
    openings: Vec<SessionGameOption>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionThemeOption {
    id: String,
    label: String,
    count: usize,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionFilterOptions {
    games: Vec<SessionGameCategory>,
    themes: Vec<SessionThemeOption>,
    min_rating: u32,
    max_rating: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SessionSetupPayload {
    min_rating: u32,
    max_rating: u32,
    game: String,
    themes: Vec<String>,
}

#[derive(Clone)]
struct DatasetCache {
    dataset_path: String,
    puzzles: Vec<PuzzlePayload>,
    filters: SessionFilterOptions,
    all_indices: Arc<Vec<usize>>,
    opening_index: HashMap<String, Arc<Vec<usize>>>,
    theme_index: HashMap<String, Arc<Vec<usize>>>,
}

#[derive(Clone)]
struct FilterCatalogCache {
    dataset_path: String,
    filters: SessionFilterOptions,
}

struct DatasetSourceInfo {
    dataset_path: PathBuf,
    dataset_size_bytes: u64,
    dataset_modified_unix_seconds: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedFilterCatalog {
    dataset_path: String,
    dataset_size_bytes: u64,
    dataset_modified_unix_seconds: u64,
    filters: SessionFilterOptions,
}

const GENERATED_FILTER_CATALOG_JSON: &str =
    include_str!(concat!(env!("OUT_DIR"), "/generated_filter_catalog.json"));

#[derive(Clone)]
struct FilteredPuzzleCache {
    session_setup: SessionSetupPayload,
    matching_indices: Arc<Vec<usize>>,
}

#[derive(Default)]
struct AppState {
    dataset_cache: Mutex<Option<Arc<DatasetCache>>>,
    filter_catalog_cache: Mutex<Option<Arc<FilterCatalogCache>>>,
    filtered_puzzle_cache: Mutex<Option<FilteredPuzzleCache>>,
}

const DATASET_FILE_NAMES: [&str; 2] = [
    "lichess_db_puzzle_top_10000.csv.zst",
    "lichess_db_puzzle.csv.zst",
];

fn resolve_dataset_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let current_dir = std::env::current_dir().ok()?;
    let app_data_dir = app.path().app_data_dir().ok()?;

    DATASET_FILE_NAMES.iter().find_map(|file_name| {
        [
            PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../")).join(file_name),
            current_dir.join(file_name),
            app_data_dir.join(file_name),
        ]
        .into_iter()
        .find(|path| path.exists() && path.is_file())
    })
}

fn resolve_dataset_source_info(app: &tauri::AppHandle) -> Result<DatasetSourceInfo, String> {
    let dataset_path = resolve_dataset_path(app).ok_or_else(|| {
        "Could not find lichess_db_puzzle.csv.zst in the workspace or app data directory"
            .to_string()
    })?;
    let metadata = std::fs::metadata(&dataset_path).map_err(|error| error.to_string())?;
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let modified_unix_seconds = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();

    Ok(DatasetSourceInfo {
        dataset_path,
        dataset_size_bytes: metadata.len(),
        dataset_modified_unix_seconds: modified_unix_seconds,
    })
}

fn resolve_filter_catalog_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    Ok(app_data_dir.join("filter-catalog-cache.json"))
}

fn parse_puzzle_record(record: &StringRecord) -> Result<PuzzlePayload, String> {
    if record.len() < 10 {
        return Err("CSV record is missing required puzzle fields".into());
    }

    let id = record.get(0).unwrap_or_default().trim();
    let fen = record.get(1).unwrap_or_default().trim();
    let moves = record
        .get(2)
        .unwrap_or_default()
        .split_whitespace()
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    let rating = record
        .get(3)
        .unwrap_or_default()
        .parse::<u32>()
        .map_err(|error| error.to_string())?;
    let themes = record
        .get(7)
        .unwrap_or_default()
        .split_whitespace()
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    let opening_tags = record
        .get(9)
        .unwrap_or_default()
        .split_whitespace()
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    if id.is_empty() || fen.is_empty() || moves.is_empty() {
        return Err("CSV record did not contain a usable puzzle".into());
    }

    Ok(PuzzlePayload {
        id: id.to_string(),
        fen: fen.to_string(),
        moves,
        rating,
        themes,
        opening_tags,
    })
}

fn format_opening_label(opening: &str) -> String {
    opening.replace('_', " ")
}

fn opening_category_id(opening: &str) -> String {
    let parts = opening
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if parts.len() <= 2 {
        parts.join("_")
    } else {
        parts[..2].join("_")
    }
}

fn build_session_game_categories(opening_counts: Vec<(String, usize)>) -> Vec<SessionGameCategory> {
    let mut categories = HashMap::<String, Vec<(String, usize)>>::new();

    for (opening, count) in opening_counts {
        categories
            .entry(opening_category_id(&opening))
            .or_default()
            .push((opening, count));
    }

    let mut category_list = categories
        .into_iter()
        .map(|(id, mut category_openings)| {
            category_openings.sort_by(|left, right| {
                right.1.cmp(&left.1).then_with(|| {
                    format_opening_label(&left.0).cmp(&format_opening_label(&right.0))
                })
            });

            let count = category_openings
                .iter()
                .map(|(_, opening_count)| opening_count)
                .sum();

            SessionGameCategory {
                label: format_opening_label(&id),
                id,
                count,
                openings: category_openings
                    .into_iter()
                    .map(|(opening, count)| SessionGameOption {
                        label: format_opening_label(&opening),
                        id: opening,
                        count,
                    })
                    .collect(),
            }
        })
        .collect::<Vec<_>>();

    category_list.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.label.cmp(&right.label))
    });
    category_list
}

fn build_session_theme_options(theme_counts: Vec<(String, usize)>) -> Vec<SessionThemeOption> {
    let mut themes = theme_counts
        .into_iter()
        .map(|(theme, count)| SessionThemeOption {
            label: theme.replace('_', " "),
            id: theme,
            count,
        })
        .collect::<Vec<_>>();

    themes.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.label.cmp(&right.label))
    });

    themes
}

fn default_session_setup() -> SessionSetupPayload {
    SessionSetupPayload {
        min_rating: 400,
        max_rating: 3200,
        game: String::new(),
        themes: Vec::new(),
    }
}

fn puzzle_matches_session_setup(
    puzzle: &PuzzlePayload,
    session_setup: &SessionSetupPayload,
) -> bool {
    if puzzle.rating < session_setup.min_rating || puzzle.rating > session_setup.max_rating {
        return false;
    }

    if !session_setup.game.is_empty()
        && !puzzle
            .opening_tags
            .iter()
            .any(|opening_tag| opening_tag == &session_setup.game)
    {
        return false;
    }

    session_setup.themes.iter().all(|theme| {
        puzzle
            .themes
            .iter()
            .any(|puzzle_theme| puzzle_theme == theme)
    })
}

fn intersect_sorted_indices(left: &[usize], right: &[usize]) -> Vec<usize> {
    let mut intersection = Vec::with_capacity(left.len().min(right.len()));
    let mut left_index = 0usize;
    let mut right_index = 0usize;

    while left_index < left.len() && right_index < right.len() {
        match left[left_index].cmp(&right[right_index]) {
            std::cmp::Ordering::Less => left_index += 1,
            std::cmp::Ordering::Greater => right_index += 1,
            std::cmp::Ordering::Equal => {
                intersection.push(left[left_index]);
                left_index += 1;
                right_index += 1;
            }
        }
    }

    intersection
}

fn build_filter_options(
    opening_counts: HashMap<String, usize>,
    theme_counts: HashMap<String, usize>,
    min_rating: u32,
    max_rating: u32,
) -> SessionFilterOptions {
    let mut games = opening_counts.into_iter().collect::<Vec<_>>();
    games.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));

    let mut themes = theme_counts.into_iter().collect::<Vec<_>>();
    themes.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));

    SessionFilterOptions {
        games: build_session_game_categories(games),
        themes: build_session_theme_options(themes),
        min_rating,
        max_rating,
    }
}

fn load_persisted_filter_catalog(
    app: &tauri::AppHandle,
    dataset_source_info: &DatasetSourceInfo,
) -> Result<Option<FilterCatalogCache>, String> {
    let cache_path = resolve_filter_catalog_cache_path(app)?;
    if !cache_path.exists() {
        return Ok(None);
    }

    let cache_contents = std::fs::read_to_string(&cache_path).map_err(|error| error.to_string())?;
    let persisted_cache = serde_json::from_str::<PersistedFilterCatalog>(&cache_contents)
        .map_err(|error| error.to_string())?;

    if persisted_cache.dataset_path != dataset_source_info.dataset_path.display().to_string()
        || persisted_cache.dataset_size_bytes != dataset_source_info.dataset_size_bytes
        || persisted_cache.dataset_modified_unix_seconds
            != dataset_source_info.dataset_modified_unix_seconds
    {
        return Ok(None);
    }

    log::info!(
        "Loaded persisted filter catalog from {}",
        cache_path.display()
    );

    Ok(Some(FilterCatalogCache {
        dataset_path: persisted_cache.dataset_path,
        filters: persisted_cache.filters,
    }))
}

fn load_generated_filter_catalog(
    dataset_source_info: &DatasetSourceInfo,
) -> Result<Option<FilterCatalogCache>, String> {
    let generated_catalog =
        serde_json::from_str::<PersistedFilterCatalog>(GENERATED_FILTER_CATALOG_JSON)
            .map_err(|error| error.to_string())?;

    if generated_catalog.dataset_path != dataset_source_info.dataset_path.display().to_string()
        || generated_catalog.dataset_size_bytes != dataset_source_info.dataset_size_bytes
        || generated_catalog.dataset_modified_unix_seconds
            != dataset_source_info.dataset_modified_unix_seconds
    {
        return Ok(None);
    }

    log::info!(
        "Loaded generated filter catalog for {}",
        generated_catalog.dataset_path
    );

    Ok(Some(FilterCatalogCache {
        dataset_path: generated_catalog.dataset_path,
        filters: generated_catalog.filters,
    }))
}

fn persist_filter_catalog(
    app: &tauri::AppHandle,
    dataset_source_info: &DatasetSourceInfo,
    filters: &SessionFilterOptions,
) -> Result<(), String> {
    let cache_path = resolve_filter_catalog_cache_path(app)?;
    let persisted_cache = PersistedFilterCatalog {
        dataset_path: dataset_source_info.dataset_path.display().to_string(),
        dataset_size_bytes: dataset_source_info.dataset_size_bytes,
        dataset_modified_unix_seconds: dataset_source_info.dataset_modified_unix_seconds,
        filters: filters.clone(),
    };
    let serialized = serde_json::to_string(&persisted_cache).map_err(|error| error.to_string())?;
    std::fs::write(&cache_path, serialized).map_err(|error| error.to_string())?;

    log::info!("Persisted filter catalog to {}", cache_path.display());

    Ok(())
}

fn load_filter_catalog_cache(app: &tauri::AppHandle) -> Result<FilterCatalogCache, String> {
    let started_at = Instant::now();
    let dataset_source_info = resolve_dataset_source_info(app)?;

    if let Some(cache) = load_generated_filter_catalog(&dataset_source_info)? {
        return Ok(cache);
    }

    if let Some(cache) = load_persisted_filter_catalog(app, &dataset_source_info)? {
        return Ok(cache);
    }

    let dataset_path = dataset_source_info.dataset_path.clone();

    let dataset_file = File::open(&dataset_path).map_err(|error| error.to_string())?;
    let decoder = Decoder::new(dataset_file).map_err(|error| error.to_string())?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(decoder);

    let mut opening_counts = HashMap::<String, usize>::new();
    let mut theme_counts = HashMap::<String, usize>::new();
    let mut min_rating = u32::MAX;
    let mut max_rating = 0u32;

    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        if record.len() < 10 {
            continue;
        }

        let Ok(rating) = record.get(3).unwrap_or_default().parse::<u32>() else {
            continue;
        };

        min_rating = min_rating.min(rating);
        max_rating = max_rating.max(rating);

        for theme in record.get(7).unwrap_or_default().split_whitespace() {
            *theme_counts.entry(theme.to_string()).or_default() += 1;
        }

        for opening_tag in record.get(9).unwrap_or_default().split_whitespace() {
            *opening_counts.entry(opening_tag.to_string()).or_default() += 1;
        }
    }

    if min_rating == u32::MAX {
        min_rating = 400;
        max_rating = 3200;
    }

    let filters = build_filter_options(opening_counts, theme_counts, min_rating, max_rating);

    persist_filter_catalog(app, &dataset_source_info, &filters)?;

    log::info!(
        "Loaded filter catalog from {} with {} game categories and {} themes in {:?}",
        dataset_path.display(),
        filters.games.len(),
        filters.themes.len(),
        started_at.elapsed()
    );

    Ok(FilterCatalogCache {
        dataset_path: dataset_path.display().to_string(),
        filters,
    })
}

fn load_dataset_cache(app: &tauri::AppHandle) -> Result<DatasetCache, String> {
    let started_at = Instant::now();
    let dataset_path = resolve_dataset_path(app).ok_or_else(|| {
        "Could not find lichess_db_puzzle.csv.zst in the workspace or app data directory"
            .to_string()
    })?;

    let dataset_file = File::open(&dataset_path).map_err(|error| error.to_string())?;
    let decoder = Decoder::new(dataset_file).map_err(|error| error.to_string())?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(decoder);

    let mut opening_counts = HashMap::<String, usize>::new();
    let mut theme_counts = HashMap::<String, usize>::new();
    let mut opening_index = HashMap::<String, Vec<usize>>::new();
    let mut theme_index = HashMap::<String, Vec<usize>>::new();
    let mut min_rating = u32::MAX;
    let mut max_rating = 0u32;
    let mut puzzles = Vec::new();

    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        let puzzle = match parse_puzzle_record(&record) {
            Ok(puzzle) => puzzle,
            Err(_) => continue,
        };

        min_rating = min_rating.min(puzzle.rating);
        max_rating = max_rating.max(puzzle.rating);

        for opening_tag in &puzzle.opening_tags {
            *opening_counts.entry(opening_tag.clone()).or_default() += 1;
            opening_index
                .entry(opening_tag.clone())
                .or_default()
                .push(puzzles.len());
        }

        for theme in &puzzle.themes {
            *theme_counts.entry(theme.clone()).or_default() += 1;
            theme_index
                .entry(theme.clone())
                .or_default()
                .push(puzzles.len());
        }

        puzzles.push(puzzle);
    }

    if min_rating == u32::MAX {
        min_rating = 400;
        max_rating = 3200;
    }

    log::info!(
        "Loaded dataset cache from {} with {} puzzles in {:?}",
        dataset_path.display(),
        puzzles.len(),
        started_at.elapsed()
    );

    let all_indices = Arc::new((0..puzzles.len()).collect::<Vec<_>>());
    let opening_index = opening_index
        .into_iter()
        .map(|(opening, indices)| (opening, Arc::new(indices)))
        .collect::<HashMap<_, _>>();
    let theme_index = theme_index
        .into_iter()
        .map(|(theme, indices)| (theme, Arc::new(indices)))
        .collect::<HashMap<_, _>>();

    Ok(DatasetCache {
        dataset_path: dataset_path.display().to_string(),
        puzzles,
        filters: build_filter_options(opening_counts, theme_counts, min_rating, max_rating),
        all_indices,
        opening_index,
        theme_index,
    })
}

#[tauri::command]
fn load_startup_puzzle(app: tauri::AppHandle) -> Result<FeaturedPuzzleResponse, String> {
    let started_at = Instant::now();
    let dataset_path = resolve_dataset_path(&app).ok_or_else(|| {
        "Could not find lichess_db_puzzle.csv.zst in the workspace or app data directory"
            .to_string()
    })?;

    let dataset_file = File::open(&dataset_path).map_err(|error| error.to_string())?;
    let decoder = Decoder::new(dataset_file).map_err(|error| error.to_string())?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(decoder);

    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        let puzzle = match parse_puzzle_record(&record) {
            Ok(puzzle) => puzzle,
            Err(_) => continue,
        };

        log::info!(
            "load_startup_puzzle resolved first usable puzzle in {:?}",
            started_at.elapsed()
        );

        return Ok(FeaturedPuzzleResponse {
            dataset_path: dataset_path.display().to_string(),
            puzzle,
        });
    }

    Err(format!(
        "Reached the end of {} before finding a usable startup puzzle",
        dataset_path.display()
    ))
}

fn load_matching_puzzle_at_index(
    app: &tauri::AppHandle,
    session_setup: &SessionSetupPayload,
    target_index: usize,
) -> Result<FeaturedPuzzleResponse, String> {
    let started_at = Instant::now();
    let dataset_path = resolve_dataset_path(app).ok_or_else(|| {
        "Could not find lichess_db_puzzle.csv.zst in the workspace or app data directory"
            .to_string()
    })?;

    let dataset_file = File::open(&dataset_path).map_err(|error| error.to_string())?;
    let decoder = Decoder::new(dataset_file).map_err(|error| error.to_string())?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(decoder);

    let mut matching_index = 0usize;

    for record in reader.records() {
        let record = record.map_err(|error| error.to_string())?;
        let puzzle = match parse_puzzle_record(&record) {
            Ok(puzzle) => puzzle,
            Err(_) => continue,
        };

        if !puzzle_matches_session_setup(&puzzle, session_setup) {
            continue;
        }

        if matching_index != target_index {
            matching_index += 1;
            continue;
        }

        log::info!(
            "load_matching_puzzle_at_index resolved filtered index {} in {:?}",
            target_index,
            started_at.elapsed()
        );

        return Ok(FeaturedPuzzleResponse {
            dataset_path: dataset_path.display().to_string(),
            puzzle,
        });
    }

    Err(format!(
        "Reached the end of {} before finding matching puzzle index {}",
        dataset_path.display(),
        target_index
    ))
}

fn get_dataset_cache(
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<Arc<DatasetCache>, String> {
    let resolved_path = resolve_dataset_path(app).ok_or_else(|| {
        "Could not find lichess_db_puzzle.csv.zst in the workspace or app data directory"
            .to_string()
    })?;
    let resolved_path = resolved_path.display().to_string();

    let mut dataset_cache = state
        .dataset_cache
        .lock()
        .map_err(|_| "Failed to lock dataset cache".to_string())?;

    let should_reload = dataset_cache
        .as_ref()
        .map(|cache| cache.dataset_path != resolved_path)
        .unwrap_or(true);

    if should_reload {
        log::info!("Dataset cache miss for {}", resolved_path);
        let next_cache = Arc::new(load_dataset_cache(app)?);
        *dataset_cache = Some(Arc::clone(&next_cache));

        let mut filtered_cache = state
            .filtered_puzzle_cache
            .lock()
            .map_err(|_| "Failed to lock filtered puzzle cache".to_string())?;
        *filtered_cache = None;

        return Ok(next_cache);
    }

    log::info!("Dataset cache hit for {}", resolved_path);

    dataset_cache
        .as_ref()
        .map(Arc::clone)
        .ok_or_else(|| "Dataset cache was unexpectedly empty".to_string())
}

fn get_filter_catalog_cache(
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<Arc<FilterCatalogCache>, String> {
    let resolved_path = resolve_dataset_path(app).ok_or_else(|| {
        "Could not find lichess_db_puzzle.csv.zst in the workspace or app data directory"
            .to_string()
    })?;
    let resolved_path = resolved_path.display().to_string();

    let mut filter_catalog_cache = state
        .filter_catalog_cache
        .lock()
        .map_err(|_| "Failed to lock filter catalog cache".to_string())?;

    let should_reload = filter_catalog_cache
        .as_ref()
        .map(|cache| cache.dataset_path != resolved_path)
        .unwrap_or(true);

    if should_reload {
        log::info!("Filter catalog cache miss for {}", resolved_path);
        let next_cache = Arc::new(load_filter_catalog_cache(app)?);
        *filter_catalog_cache = Some(Arc::clone(&next_cache));
        return Ok(next_cache);
    }

    log::info!("Filter catalog cache hit for {}", resolved_path);

    filter_catalog_cache
        .as_ref()
        .map(Arc::clone)
        .ok_or_else(|| "Filter catalog cache was unexpectedly empty".to_string())
}

fn get_matching_indices(
    state: &tauri::State<AppState>,
    dataset_cache: &DatasetCache,
    session_setup: &SessionSetupPayload,
) -> Result<Arc<Vec<usize>>, String> {
    let mut filtered_cache = state
        .filtered_puzzle_cache
        .lock()
        .map_err(|_| "Failed to lock filtered puzzle cache".to_string())?;

    if let Some(cache) = filtered_cache.as_ref() {
        if cache.session_setup == *session_setup {
            log::info!(
                "Filter cache hit for game='{}', themes={}, range={}-{} with {} matches",
                session_setup.game,
                session_setup.themes.len(),
                session_setup.min_rating,
                session_setup.max_rating,
                cache.matching_indices.len()
            );
            return Ok(Arc::clone(&cache.matching_indices));
        }
    }

    let started_at = Instant::now();
    let uses_default_rating = session_setup.min_rating == dataset_cache.filters.min_rating
        && session_setup.max_rating == dataset_cache.filters.max_rating;
    let mut candidate_sets = Vec::new();

    if !session_setup.game.is_empty() {
        let Some(indices) = dataset_cache.opening_index.get(&session_setup.game) else {
            return Ok(Arc::new(Vec::new()));
        };
        candidate_sets.push(indices);
    }

    for theme in &session_setup.themes {
        let Some(indices) = dataset_cache.theme_index.get(theme) else {
            return Ok(Arc::new(Vec::new()));
        };
        candidate_sets.push(indices);
    }

    candidate_sets.sort_by_key(|indices| indices.len());

    let matching_indices = if candidate_sets.is_empty() {
        if uses_default_rating {
            Arc::clone(&dataset_cache.all_indices)
        } else {
            Arc::new(
                dataset_cache
                    .all_indices
                    .iter()
                    .copied()
                    .filter(|index| {
                        let rating = dataset_cache.puzzles[*index].rating;
                        rating >= session_setup.min_rating && rating <= session_setup.max_rating
                    })
                    .collect::<Vec<_>>(),
            )
        }
    } else {
        let mut intersected = candidate_sets[0].as_ref().clone();

        for indices in candidate_sets.iter().skip(1) {
            intersected = intersect_sorted_indices(&intersected, indices.as_ref());

            if intersected.is_empty() {
                break;
            }
        }

        if uses_default_rating {
            Arc::new(intersected)
        } else {
            Arc::new(
                intersected
                    .into_iter()
                    .filter(|index| {
                        let rating = dataset_cache.puzzles[*index].rating;
                        rating >= session_setup.min_rating && rating <= session_setup.max_rating
                    })
                    .collect::<Vec<_>>(),
            )
        }
    };

    *filtered_cache = Some(FilteredPuzzleCache {
        session_setup: session_setup.clone(),
        matching_indices: Arc::clone(&matching_indices),
    });

    log::info!(
        "Filter cache rebuilt for game='{}', themes={}, range={}-{} with {} matches in {:?}",
        session_setup.game,
        session_setup.themes.len(),
        session_setup.min_rating,
        session_setup.max_rating,
        matching_indices.len(),
        started_at.elapsed()
    );

    Ok(matching_indices)
}

#[tauri::command]
fn load_session_filters(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<SessionFilterOptions, String> {
    let started_at = Instant::now();
    let filters = get_filter_catalog_cache(&app, &state)?.filters.clone();
    log::info!(
        "load_session_filters returned {} game categories and {} themes in {:?}",
        filters.games.len(),
        filters.themes.len(),
        started_at.elapsed()
    );
    Ok(filters)
}

#[tauri::command]
fn bootstrap_state(app: tauri::AppHandle) -> Result<BootstrapState, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    Ok(BootstrapState {
        product_name: app.package_info().name.clone(),
        app_version: app.package_info().version.to_string(),
        app_data_dir: app_data_dir.display().to_string(),
    })
}

#[tauri::command]
fn load_featured_puzzle(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    index: Option<usize>,
    session_setup: Option<SessionSetupPayload>,
) -> Result<FeaturedPuzzleResponse, String> {
    let started_at = Instant::now();
    let target_index = index.unwrap_or(0);
    let session_setup = session_setup.unwrap_or_else(default_session_setup);

    let should_stream_from_dataset = state
        .dataset_cache
        .lock()
        .map_err(|_| "Failed to lock dataset cache".to_string())?
        .is_none();

    if should_stream_from_dataset {
        return load_matching_puzzle_at_index(&app, &session_setup, target_index);
    }

    let dataset_cache = get_dataset_cache(&app, &state)?;
    let matching_indices = get_matching_indices(&state, &dataset_cache, &session_setup)?;

    if let Some(puzzle_index) = matching_indices.get(target_index) {
        log::info!(
            "load_featured_puzzle resolved filtered index {} to dataset index {} in {:?}",
            target_index,
            puzzle_index,
            started_at.elapsed()
        );
        return Ok(FeaturedPuzzleResponse {
            dataset_path: dataset_cache.dataset_path.clone(),
            puzzle: dataset_cache.puzzles[*puzzle_index].clone(),
        });
    }

    Err(format!(
        "Reached the end of {} before finding matching puzzle index {}",
        dataset_cache.dataset_path, target_index
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            bootstrap_state,
            load_startup_puzzle,
            load_featured_puzzle,
            load_session_filters
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
