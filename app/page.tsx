import { redirect } from 'next/navigation';

/** The control room is the landing screen; operators arrive via their personal link. */
export default function HomePage() {
  redirect('/admin');
}
