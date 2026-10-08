import { installItemPopstateGuard } from '@/lib/item-popstate';

// Register before hydration/Next's own history listener. Inert outside an editor.
installItemPopstateGuard();
