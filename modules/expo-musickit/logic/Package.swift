// swift-tools-version: 6.2
// This manifest exists purely so `swift test --package-path modules/expo-musickit/logic`
// can run the XCTest suite over the pure decision logic in Sources/. The app
// itself never builds this package: the ExpoMusicKit podspec compiles the
// same Sources/ files directly into the pod target (see
// modules/expo-musickit/ExpoMusicKit.podspec).
import PackageDescription

let package = Package(
  name: "MusicKitLogic",
  platforms: [
    .iOS(.v16),
    .macOS(.v13),
  ],
  products: [
    .library(name: "MusicKitLogic", targets: ["MusicKitLogic"]),
  ],
  targets: [
    .target(
      name: "MusicKitLogic",
      path: "Sources/MusicKitLogic"
    ),
    .testTarget(
      name: "MusicKitLogicTests",
      dependencies: ["MusicKitLogic"],
      path: "Tests/MusicKitLogicTests"
    ),
  ]
)
