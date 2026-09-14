// 404 — a lost little apple.
import { Link } from 'react-router-dom';
import { LostAppleIllustration } from '../components/glyphs';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="empty-state">
        <LostAppleIllustration />
        <h2>This apple is lost</h2>
        <p>The page you&rsquo;re looking for doesn&rsquo;t exist — or wandered off the map.</p>
        <Link to="/" className="btn btn-primary">
          Back to your projects
        </Link>
      </div>
    </div>
  );
}
