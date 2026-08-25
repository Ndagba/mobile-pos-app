import { redirect } from 'next/navigation';

/** The app entry redirects to the dashboard; the (app) guard handles auth. */
export default function Home() {
  redirect('/dashboard');
}
