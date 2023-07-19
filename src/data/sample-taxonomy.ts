/**
 * sample returned response for toml file
 * will be returned as a txt of string
 */

export const taxonomy = `
  name = "Taxonomy"

  [[genres]]
  name = "reference"

  [[genres]]
  name = "tutorial"

  [[target_platforms]]
  name = "atlas"
  [[target_platforms.versions]]
  name = "v1.2"
  [[target_platforms.versions]]
  name = "master"

  [[target_platforms]]
  name = "atlas-cli"
  display_name = "Atlas CLI"
  [[target_platforms.versions]]
  name = "v1.2"
  [[target_platforms.versions]]
  name = "master"

  [[target_platforms]]
  name = "manual"
  [[target_platforms.versions]]
  name = "v1.0"
  [[target_platforms.versions]]
  name = "master"

  [[target_platforms]]
  name = "spark-connector"
  display_name = "Spark Connector"
  [[target_platforms.versions]]
  name = "v2.0"
  [[target_platforms.versions]]
  name = "v2.1"

  [[target_platforms]]
  name = "node"
  [[target_platforms.versions]]
  name = "v4.9"

  [[target_platforms]]
  name = "mongocli"
  display_name = "Mongo CLI"
  [[target_platforms.versions]]
  name = "v1.0"

  [[target_platforms]]
  name = "visual-studio-extension"
  [[target_platforms.versions]]
  name = "current"

  [[target_platforms]]
  name = "golang"
  [[target_platforms.versions]]
  name = "v1.7"

  [[target_platforms]]
  name = "java"
  [[target_platforms.versions]]
  name = "v4.3"
`;
