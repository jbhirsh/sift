require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoMusicKit'
  s.version        = package['version']
  s.summary        = 'Expo module for Apple MusicKit'
  s.description    = 'Expo module for Apple MusicKit'
  s.license        = 'MIT'
  s.author         = 'Jessica Hirsh'
  s.homepage       = 'https://github.com/jessicahirsh/sift'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/jessicahirsh/sift.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'MusicKit'

  # This podspec lives at the module root (see podspecPath in
  # expo-module.config.json) so the pure decision logic in logic/Sources can
  # be compiled into the same pod target as the module itself. The SwiftPM
  # manifest at logic/Package.swift exists purely so
  # `swift test --package-path modules/expo-musickit/logic` can run the
  # XCTest suite over those files; the app never builds that package.
  # logic/Tests, logic/Package.swift, and logic/.build are deliberately NOT
  # matched by these globs — compiling them into the app would fail (XCTest,
  # PackageDescription) or pull in SwiftPM build artifacts.
  s.source_files   = ['ios/**/*.{h,m,swift}', 'logic/Sources/**/*.swift']
end
