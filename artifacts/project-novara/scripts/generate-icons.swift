// Generates every Novara app icon and the iOS launch image from one definition,
// so they can never drift apart.
//
//   swift scripts/generate-icons.swift <size> <output.png> [glyphScale]
//
//   swift scripts/generate-icons.swift 1024 "ios/App/App/Assets.xcassets/AppIcon.appiconset/NovaraLogo 1024.png"
//   swift scripts/generate-icons.swift  512 public/icon-512.png
//   swift scripts/generate-icons.swift  512 public/icon-512-maskable.png
//   swift scripts/generate-icons.swift  192 public/icon-192.png
//   swift scripts/generate-icons.swift  180 public/apple-touch-icon.png
//   swift scripts/generate-icons.swift 2732 ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png 0.55
//
// glyphScale shrinks the letter for the launch image, where a full-size icon
// glyph would look enormous. Output has no alpha channel, which the App Store
// requires of the 1024 icon.
//
// public/favicon.svg draws the same mark by hand — keep the two in step.
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

// Novara app icon: white "N" on a radial blue glow.
let size = CGFloat(CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? 1024 : 1024)
let out = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "icon.png"
let glyphScale = CGFloat(CommandLine.arguments.count > 3 ? Double(CommandLine.arguments[3]) ?? 1.0 : 1.0)

let space = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: Int(size), height: Int(size),
                          bitsPerComponent: 8, bytesPerRow: 0, space: space,
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
    fatalError("context")
}

// Radial gradient: lit centre falling off to a near-black navy at the corners.
let centre = CGColor(colorSpace: space, components: [0.075, 0.204, 0.655, 1.0])!  // #1334A7
let edge   = CGColor(colorSpace: space, components: [0.016, 0.055, 0.255, 1.0])!  // #040E41
ctx.setFillColor(edge)
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
let gradient = CGGradient(colorsSpace: space, colors: [centre, edge] as CFArray,
                          locations: [0.0, 1.0])!
let mid = CGPoint(x: size / 2, y: size / 2)
ctx.drawRadialGradient(gradient, startCenter: mid, startRadius: 0,
                       endCenter: mid, endRadius: size * 0.72, options: [.drawsAfterEndLocation])

// The letter, sized by its cap height so it occupies a fixed share of the canvas.
let targetCapHeight = size * 0.315 * glyphScale
let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 100, nil)
let capRatio = CTFontGetCapHeight(font) / 100
let fontSize = targetCapHeight / capRatio
let sized = CTFontCreateWithName("Helvetica-Bold" as CFString, fontSize, nil)

let attrs: [CFString: Any] = [
    kCTFontAttributeName: sized,
    kCTForegroundColorAttributeName: CGColor(colorSpace: space, components: [1, 1, 1, 1])!,
]
let line = CTLineCreateWithAttributedString(NSAttributedString(string: "N", attributes: attrs as? [NSAttributedString.Key: Any] ?? [:]))
let bounds = CTLineGetBoundsWithOptions(line, .useGlyphPathBounds)

ctx.textPosition = CGPoint(x: mid.x - bounds.width / 2 - bounds.minX,
                           y: mid.y - bounds.height / 2 - bounds.minY)
CTLineDraw(line, ctx)

guard let image = ctx.makeImage() else { fatalError("image") }
let url = URL(fileURLWithPath: out)
guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fatalError("dest")
}
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print("wrote \(out) at \(Int(size))x\(Int(size))")
