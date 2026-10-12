import Foundation

// The module's caches of MusicKit objects. Its sync Functions run on the JS
// thread while its AsyncFunctions run on Swift concurrency threads, and both
// read and write the caches, so every access takes the lock.

/// A dictionary that is safe to read and write from any thread.
final class LockedCache<Value> {
  private var storage: [String: Value] = [:]
  private let lock = NSLock()

  subscript(key: String) -> Value? {
    get { lock.withLock { storage[key] } }
    set { lock.withLock { storage[key] = newValue } }
  }

  /// Store the value unless something is already stored under the key.
  func setIfAbsent(_ value: Value, for key: String) {
    lock.withLock {
      if storage[key] == nil { storage[key] = value }
    }
  }

  var values: [Value] { lock.withLock { Array(storage.values) } }
}
