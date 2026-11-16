import { notFound } from 'next/navigation';

/** Any address under a language that the site does not have shows that language's not-found page. */
export default function Unknown(): never {
  notFound();
}
