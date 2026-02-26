import { redirect } from 'next/navigation';

// Root redirects to login; after login the user is sent to their restaurant dashboard.
export default function RootPage() {
  redirect('/login');
}
