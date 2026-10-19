import AppKit
import UniformTypeIdentifiers
import Foundation

let destination = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "public/icons/file-types/macos", isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
// Run on macOS to regenerate the static Finder assets; never used by the server.
let types: [(String, UTType)] = [
    ("folder", .folder), ("generic", .data), ("application", .applicationBundle),
    ("image", .image), ("video", .movie), ("audio", .audio),
    ("code", .sourceCode), ("archive", .archive), ("font", .font),
    ("ipa", UTType(filenameExtension: "ipa")!),
    ("dmg", UTType(filenameExtension: "dmg")!),
    ("pkg", UTType(filenameExtension: "pkg")!),
    ("pdf", .pdf), ("txt", .plainText),
]
for (name, type) in types {
    let icon = NSWorkspace.shared.icon(for: type)
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 128, pixelsHigh: 128, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    icon.draw(in: NSRect(x: 0, y: 0, width: 128, height: 128), from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name + ".png"))
    print(name + " " + type.identifier)
}
