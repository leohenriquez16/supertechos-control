export default function StubPage({ titulo, descripcion }) {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-zinc-900">{titulo}</h1>
      <p className="text-xs text-zinc-500 mt-1">{descripcion}</p>
      <div className="bg-white border border-zinc-200 rounded shadow-sm p-12 mt-6 text-center">
        <div className="text-zinc-400 text-sm">Pantalla en construcción</div>
        <div className="text-xs text-zinc-400 mt-1">Se entrega en sprint correspondiente del plan PNM</div>
      </div>
    </div>
  );
}
