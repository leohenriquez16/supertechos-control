import Topbar from '../../components/banreservas/Topbar';

export default function BanreservasLayout({ children }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Topbar />
      {children}
    </div>
  );
}
