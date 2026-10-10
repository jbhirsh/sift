// Renders SF Symbols the way the app's SymbolView configures them on iOS
// (expo-symbols: point size UIFont.systemFontSize = 14, regular weight,
// medium scale, monochrome), as alpha masks at 32x, plus each image's size.
// The app's SymbolView stretches that image to fill its size x size frame.
// Usage (on a Mac): swift export.swift <symbol names...>  -> ./out
import AppKit

let names = CommandLine.arguments.dropFirst()
let out = URL(fileURLWithPath: "out")
try! FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
var meta: [String: [Double]] = [:]
let config = NSImage.SymbolConfiguration(pointSize: 14, weight: .regular, scale: .medium)
for name in names {
  guard let base = NSImage(systemSymbolName: name, accessibilityDescription: nil),
        let img = base.withSymbolConfiguration(config) else {
    print("missing \(name)")
    continue
  }
  let size = img.size
  let k: CGFloat = 32
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int((size.width * k).rounded()), pixelsHigh: Int((size.height * k).rounded()),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = size
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  img.draw(in: NSRect(origin: .zero, size: size))
  NSColor.black.set()
  NSRect(origin: .zero, size: size).fill(using: .sourceAtop)
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent("\(name).png"))
  meta[name] = [Double(size.width), Double(size.height)]
  print(name, size)
}
let json = try! JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted, .sortedKeys])
try! json.write(to: out.appendingPathComponent("sizes.json"))
