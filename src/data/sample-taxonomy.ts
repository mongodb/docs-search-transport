/**
 * sample returned response for toml file
 * will be returned as a txt of string
 */

export const taxonomy = `
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

    [[target_platforms.versions]]
    name = "upcoming"

  [[target_platforms]]
  name = "manual"

    [[target_platforms.versions]]
    name = "v5.0"

    [[target_platforms.versions]]
    name = "v6.0"

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
  display_name = "Visual Studio Extension"

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

  [[target_platforms]]
  name = "drivers"
  display_name = "Drivers and Libraries"
  versions = ["master"]

    [[target_platforms.sub_platforms]]
    name = "C Driver"
    versions = [ "v1.0" ]

    [[target_platforms.sub_platforms]]
    name = "C++ Driver"
    versions = [ "v1.0" ]

  [[programming_language]]
  name = "Objective-C"

  [[programming_language]]
  name = "C"

  [[programming_language]]
  name = "C#"

  [[programming_language]]
  name = "C++"

  [[programming_language]]
  name = "Dart"

  [[programming_language]]
  name = "Go"

  [[programming_language]]
  name = "Java"

  [[programming_language]]
  name = "Kotlin"

  [[programming_language]]
  name = "PHP"

  [[programming_language]]
  name = "Python"

  [[programming_language]]
  name = "Ruby"

  [[programming_language]]
  name = "Rust"

  [[programming_language]]
  name = "Scala"

  [[programming_language]]
  name = "Swift"

  [[programming_language]]
  name = "Javascript/Typescript"

  [[programming_language]]
  name = "Shell"

  [[programming_language]]
  name = "JSON"

  [[programming_language]]
  name = "RealmQL"

  [[programming_language]]
  name = "GraphQL"

  [[programming_language]]
  name = "MQL"
`;
