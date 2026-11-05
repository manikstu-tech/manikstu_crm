import Link from 'next/link';
import { COPYRIGHT } from '../components/SiteFooter';

export default function NotFound() {
  return (
    <div style={{ padding: '4rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>404 - Page Not Found</h2>
      <p style={{ marginBottom: '1.5rem', color: '#666' }}>The requested page could not be found.</p>
      <Link href="/login" style={{ color: '#0066cc', textDecoration: 'underline' }}>
        Return to Login
      </Link>
      <p style={{ marginTop: '3rem', fontSize: '12.5px', color: '#5D6A63' }}>{COPYRIGHT}</p>
    </div>
  );
}
