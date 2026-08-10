/**
 * Re-export pure confirm gates from lib (stable import path for older call sites).
 */
export {
  isExplicitConfirmMessage,
  isElevatedConfirmMessage,
  messageSatisfiesConfirmLevel,
} from '@/lib/aiTools/confirmGate'
