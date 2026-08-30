// 404 — a lost little golem.
import { Link } from 'react-router-dom';
import { LostGolemIllustration } from '../components/glyphs';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="empty-state">
        <LostGolemIllustration />
        <h2>This golem is lost</h2>
        <p>The page you&rsquo;re looking for doesn&rsquo;t exist — or wandered off the map.</p>
        <Link to="/" className="btn btn-primary">
          Back to your projects
        </Link>
      </div>
    </div>
  );
}
