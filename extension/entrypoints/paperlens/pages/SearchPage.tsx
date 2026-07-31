import { Navigate, useSearchParams } from 'react-router-dom';

export default function SearchPage() {
  const [params] = useSearchParams();
  const next = new URLSearchParams({ tab: 'discover' });
  const query = params.get('q');
  if (query) next.set('q', query);

  return <Navigate to={`/article?${next.toString()}`} replace />;
}
