use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use zstd::stream::read::Decoder;

const DATASET_FILE_NAMES: [&str; 2] = [
  "lichess_db_puzzle_top_10000.csv.zst",
  "lichess_db_puzzle.csv.zst",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionGameOption {
  id: String,
  label: String,
  count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionGameCategory {
  id: String,
  label: String,
  count: usize,
  openings: Vec<SessionGameOption>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionThemeOption {
  id: String,
  label: String,
  count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionFilterOptions {
  games: Vec<SessionGameCategory>,
  themes: Vec<SessionThemeOption>,
  min_rating: u32,
  max_rating: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedFilterCatalog {
  dataset_path: String,
  dataset_size_bytes: u64,
  dataset_modified_unix_seconds: u64,
  filters: SessionFilterOptions,
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

fn generate_filter_catalog(dataset_path: &Path) -> Result<GeneratedFilterCatalog, String> {
  let metadata = std::fs::metadata(dataset_path).map_err(|error| error.to_string())?;
  let modified = metadata.modified().map_err(|error| error.to_string())?;
  let modified_unix_seconds = modified
    .duration_since(UNIX_EPOCH)
    .map_err(|error| error.to_string())?
    .as_secs();

  let dataset_file = File::open(dataset_path).map_err(|error| error.to_string())?;
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

  Ok(GeneratedFilterCatalog {
    dataset_path: dataset_path.display().to_string(),
    dataset_size_bytes: metadata.len(),
    dataset_modified_unix_seconds: modified_unix_seconds,
    filters: build_filter_options(opening_counts, theme_counts, min_rating, max_rating),
  })
}

fn main() {
  let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("missing manifest dir"));
  let dataset_root = manifest_dir.join("..");

  for file_name in DATASET_FILE_NAMES {
    println!("cargo:rerun-if-changed={}", dataset_root.join(file_name).display());
  }

  let dataset_path = DATASET_FILE_NAMES
    .iter()
    .map(|file_name| dataset_root.join(file_name))
    .find(|path| path.exists() && path.is_file())
    .unwrap_or_else(|| dataset_root.join("lichess_db_puzzle.csv.zst"));

  println!("cargo:rerun-if-changed=build.rs");

  let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("missing out dir"));
  let generated_catalog_path = out_dir.join("generated_filter_catalog.json");

  let generated_catalog = generate_filter_catalog(&dataset_path)
    .unwrap_or_else(|error| panic!("failed to generate filter catalog: {error}"));
  let serialized = serde_json::to_string(&generated_catalog)
    .unwrap_or_else(|error| panic!("failed to serialize generated filter catalog: {error}"));
  std::fs::write(&generated_catalog_path, serialized)
    .unwrap_or_else(|error| panic!("failed to write generated filter catalog: {error}"));

  tauri_build::build()
}
