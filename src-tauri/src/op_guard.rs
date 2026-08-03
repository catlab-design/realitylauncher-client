
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;

/// Guard preventing long-running filesystem operations from overlapping.
///
/// An **exclusive** guard (folder migration) and **shared** guards (modpack
/// install, cloud sync) are mutually exclusive: migration must not copy the
/// game-data folder while an install/sync is writing into it, and installs
/// must not start while a migration is in flight.
static EXCLUSIVE: AtomicBool = AtomicBool::new(false);
static SHARED: AtomicUsize = AtomicUsize::new(0);
static LOCK: Mutex<()> = Mutex::new(());

pub enum OperationGuard {
    Exclusive,
    Shared,
}

impl OperationGuard {
    /// Acquire the exclusive guard. `None` if any operation is active.
    pub fn try_exclusive() -> Option<OperationGuard> {
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if EXCLUSIVE.load(Ordering::SeqCst) || SHARED.load(Ordering::SeqCst) > 0 {
            return None;
        }
        EXCLUSIVE.store(true, Ordering::SeqCst);
        Some(OperationGuard::Exclusive)
    }

    /// Acquire a shared guard. `None` if an exclusive operation is active.
    pub fn try_shared() -> Option<OperationGuard> {
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if EXCLUSIVE.load(Ordering::SeqCst) {
            return None;
        }
        SHARED.fetch_add(1, Ordering::SeqCst);
        Some(OperationGuard::Shared)
    }
}

impl Drop for OperationGuard {
    fn drop(&mut self) {
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        match self {
            OperationGuard::Exclusive => EXCLUSIVE.store(false, Ordering::SeqCst),
            OperationGuard::Shared => {
                SHARED.fetch_sub(1, Ordering::SeqCst);
            }
        }
    }
}
