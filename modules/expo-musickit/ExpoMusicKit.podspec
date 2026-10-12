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
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/jessicahirsh/sift.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks     = ['MusicKit', 'ShazamKit', 'AVFoundation']

  # The module is a thin bridge (ios/); its decisions live in TypeScript.
  # This podspec stays at the module root (see podspecPath in
  # expo-module.config.json).
  s.source_files   = 'ios/**/*.{h,m,swift}'
end
