import '../styles/globals.css';
import Sidebar from '../components/Sidebar';

export default function App({ Component, pageProps }) {
  // Don't show sidebar on login page
  if (pageProps.noLayout) return <Component {...pageProps} />;

  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-100 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Component {...pageProps} />
      </main>
    </div>
  );
}
