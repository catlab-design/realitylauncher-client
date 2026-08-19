
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Weak};

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

/// Per-operation cancellation token.
///
/// Every long-running install/sync creates its own token at entry. A cancel
/// request marks **all currently-registered** tokens; operations that start
/// *after* the request are unaffected, and an operation's entry never clears
/// a cancel the user already pressed (the old single global flag let a new
/// operation's start wipe an in-flight cancel, and one cancel aborted
/// everything including freshly-started work).
static ACTIVE_CANCELS: Mutex<Vec<Weak<AtomicBool>>> = Mutex::new(Vec::new());

pub struct CancelToken {
    flag: Arc<AtomicBool>,
    weak: Weak<AtomicBool>,
}

impl CancelToken {
    pub fn new() -> CancelToken {
        let flag = Arc::new(AtomicBool::new(false));
        let weak = Arc::downgrade(&flag);
        ACTIVE_CANCELS
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(weak.clone());
        CancelToken { flag, weak }
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    pub fn flag(&self) -> &AtomicBool {
        &self.flag
    }

    pub fn flag_arc(&self) -> Arc<AtomicBool> {
        self.flag.clone()
    }
}

impl Drop for CancelToken {
    fn drop(&mut self) {
        let mut registry = ACTIVE_CANCELS.lock().unwrap_or_else(|e| e.into_inner());
        registry.retain(|w| !w.ptr_eq(&self.weak));
    }
}

/// Mark every currently-registered operation as cancelled.
pub fn cancel_all_active() {
    let mut registry = ACTIVE_CANCELS.lock().unwrap_or_else(|e| e.into_inner());
    registry.retain(|w| match w.upgrade() {
        Some(flag) => {
            flag.store(true, Ordering::SeqCst);
            true
        }
        None => false,
    });
}
