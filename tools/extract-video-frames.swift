import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct FrameResult: Codable {
  let index: Int
  let requestedMs: Int
  let actualMs: Int
  let fileName: String
}

struct ContactSheetResult: Codable {
  let index: Int
  let firstFrameIndex: Int
  let lastFrameIndex: Int
  let fileName: String
}

struct FrameFailure: Codable {
  let requestedMs: Int
  let message: String
}

struct ExtractionResult: Codable {
  let durationMs: Int
  let width: Int
  let height: Int
  let frames: [FrameResult]
  let contactSheets: [ContactSheetResult]
  let failures: [FrameFailure]
}

enum ExtractorError: Error, CustomStringConvertible {
  case argument(String)
  case imageWrite(String)
  case noVideoTrack

  var description: String {
    switch self {
    case .argument(let message): return message
    case .imageWrite(let message): return message
    case .noVideoTrack: return "recording contains no video track"
    }
  }
}

func option(_ name: String) -> String? {
  guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
  return CommandLine.arguments[index + 1]
}

func writeJPEG(_ image: CGImage, to url: URL) throws {
  guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
    throw ExtractorError.imageWrite("cannot create JPEG destination at \(url.path)")
  }
  let properties = [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary
  CGImageDestinationAddImage(destination, image, properties)
  guard CGImageDestinationFinalize(destination) else { throw ExtractorError.imageWrite("cannot write JPEG at \(url.path)") }
}

func makeContactSheet(_ images: [CGImage], columns: Int = 4, rows: Int = 4) throws -> CGImage {
  let tileWidth = 275
  let tileHeight = 180
  let width = columns * tileWidth
  let height = rows * tileHeight
  guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    throw ExtractorError.imageWrite("cannot create contact-sheet context")
  }
  context.setFillColor(CGColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  for (index, image) in images.enumerated() {
    let column = index % columns
    let row = index / columns
    let scale = min(CGFloat(tileWidth) / CGFloat(image.width), CGFloat(tileHeight) / CGFloat(image.height))
    let drawWidth = CGFloat(image.width) * scale
    let drawHeight = CGFloat(image.height) * scale
    let x = CGFloat(column * tileWidth) + (CGFloat(tileWidth) - drawWidth) / 2
    let y = CGFloat(height - ((row + 1) * tileHeight)) + (CGFloat(tileHeight) - drawHeight) / 2
    context.draw(image, in: CGRect(x: x, y: y, width: drawWidth, height: drawHeight))
  }
  guard let sheet = context.makeImage() else { throw ExtractorError.imageWrite("cannot finalize contact sheet") }
  return sheet
}

func run() async throws {
  guard let inputPath = option("--input") else { throw ExtractorError.argument("missing --input") }
  guard let outputPath = option("--output") else { throw ExtractorError.argument("missing --output") }
  guard let fpsText = option("--fps"), let fps = Double(fpsText), fps > 0, fps <= 60 else { throw ExtractorError.argument("--fps must be in (0, 60]") }
  guard let maxFramesText = option("--max-frames"), let maxFrames = Int(maxFramesText), maxFrames >= 2, maxFrames <= 3600 else { throw ExtractorError.argument("--max-frames must be in 2...3600") }

  let output = URL(fileURLWithPath: outputPath, isDirectory: true)
  try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
  let asset = AVURLAsset(url: URL(fileURLWithPath: inputPath))
  let duration = try await asset.load(.duration)
  let durationSeconds = CMTimeGetSeconds(duration)
  guard durationSeconds.isFinite, durationSeconds > 0 else { throw ExtractorError.argument("recording duration is invalid") }
  let tracks = try await asset.loadTracks(withMediaType: .video)
  guard !tracks.isEmpty else { throw ExtractorError.noVideoTrack }

  let generator = AVAssetImageGenerator(asset: asset)
  generator.appliesPreferredTrackTransform = true
  generator.requestedTimeToleranceBefore = .zero
  generator.requestedTimeToleranceAfter = .zero
  let plannedCount = min(maxFrames, max(2, Int(floor(durationSeconds * fps)) + 1))
  var frames: [FrameResult] = []
  var failures: [FrameFailure] = []
  var contactSheets: [ContactSheetResult] = []
  var sheetImages: [CGImage] = []
  var dimensions: (Int, Int)?

  for index in 0..<plannedCount {
    let requestedSeconds = min(Double(index) / fps, max(0, durationSeconds - (1.0 / 600.0)))
    let requestedMs = Int((requestedSeconds * 1000).rounded())
    let requested = CMTime(seconds: requestedSeconds, preferredTimescale: 600)
    do {
      let result = try await generator.image(at: requested)
      dimensions = dimensions ?? (result.image.width, result.image.height)
      let fileName = String(format: "frame-%05d-%06dms.jpg", index, requestedMs)
      try writeJPEG(result.image, to: output.appendingPathComponent(fileName))
      let actualMs = max(0, Int((CMTimeGetSeconds(result.actualTime) * 1000).rounded()))
      frames.append(FrameResult(index: frames.count, requestedMs: requestedMs, actualMs: actualMs, fileName: fileName))
      sheetImages.append(result.image)
      if sheetImages.count == 16 || index == plannedCount - 1 {
        let sheetIndex = contactSheets.count
        let first = frames.count - sheetImages.count
        let last = frames.count - 1
        let sheetName = String(format: "contact-%03d-%05d-%05d.jpg", sheetIndex, first, last)
        try writeJPEG(makeContactSheet(sheetImages), to: output.appendingPathComponent(sheetName))
        contactSheets.append(ContactSheetResult(index: sheetIndex, firstFrameIndex: first, lastFrameIndex: last, fileName: sheetName))
        sheetImages.removeAll(keepingCapacity: true)
      }
    } catch {
      failures.append(FrameFailure(requestedMs: requestedMs, message: String(describing: error)))
    }
  }
  guard let (width, height) = dimensions else { throw ExtractorError.imageWrite("no video frame could be extracted") }
  let encoded = try JSONEncoder().encode(ExtractionResult(durationMs: Int((durationSeconds * 1000).rounded()), width: width, height: height, frames: frames, contactSheets: contactSheets, failures: failures))
  FileHandle.standardOutput.write(encoded)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

Task {
  do { try await run(); exit(EXIT_SUCCESS) }
  catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(EXIT_FAILURE)
  }
}
dispatchMain()
