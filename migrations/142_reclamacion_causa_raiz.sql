-- v8.65.0: ciclo completo de la reclamación — CAUSA RAÍZ al cerrar (estadística
-- de calidad: por qué reclamó el cliente). Valores de la UI: aplicacion |
-- sistema_producto | sustrato_estructura | mal_uso_cliente | fuera_garantia | otro.
ALTER TABLE reclamaciones ADD COLUMN IF NOT EXISTS causa_raiz TEXT;
NOTIFY pgrst, 'reload schema';
