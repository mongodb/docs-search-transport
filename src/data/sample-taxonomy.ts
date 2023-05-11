/**
 * sample returned response for toml file
 * will be returned as a txt of string
 */

export const taxonomy = `
  name = "Taxonomy"

  [[genres]]
  name = "Reference"

  [[genres]]
  name = "Tutorial"

  [[target_platforms]]
  name = "Atlas"
  [[target_platforms.versions]]
  name = "v1.2"
  [[target_platforms.versions]]
  name = "master"

  [[target_platforms]]
  name = "Server"
  [[target_platforms.versions]]
  name = "v1.0"
  [[target_platforms.versions]]
  name = "master"

  [[target_platforms]]
  name = "Realm"

  [[target_platforms]]
  name = "Drivers"
  [[target_platforms.versions]]
  name = "v1.4"
  [[target_platforms.versions.subversions]]
  name = "v1.4.1"
  [[target_platforms.versions.subversions]]
  name = "v1.4.9"
  [[target_platforms.versions]]
  name = "v1.6"
  [[target_platforms.versions]]
  name = "v2.0"
`;