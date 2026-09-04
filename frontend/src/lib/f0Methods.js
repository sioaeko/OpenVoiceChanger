const definitions = [
  ['pm', 'PM', 'Lowest latency CPU tracking', 'Classic', true],
  ['harvest', 'Harvest', 'Stable CPU tracking', 'Classic', true],
  ['dio', 'DIO', 'Lightweight CPU tracking', 'Classic', true],
  ['crepe', 'Crepe Full', 'Accurate neural tracking', 'Neural', true],
  ['crepe-tiny', 'Crepe Tiny', 'Lower-load neural tracking', 'Neural', true],
  ['mangio-crepe', 'Mangio-Crepe', 'Crepe with adjustable hop length', 'Neural', true],
  ['mangio-crepe-tiny', 'Mangio-Crepe Tiny', 'Light Crepe with adjustable hop', 'Neural', true],
  ['rmvpe', 'RMVPE', 'Recommended all-round neural tracking', 'Neural', true],
  ['fcpe', 'FCPE', 'Fast neural tracking', 'Neural', true],
  ['rmvpe-onnx', 'RMVPE ONNX', 'Portable ONNX inference', 'ONNX', true],
  ['crepe-onnx-full', 'Crepe ONNX Full', 'Full ONNX Crepe model', 'ONNX', true],
  ['crepe-onnx-tiny', 'Crepe ONNX Tiny', 'Lower-load ONNX Crepe model', 'ONNX', true],
  ['hybrid[crepe+rmvpe]', 'Hybrid: Crepe + RMVPE', 'Median of two estimators', 'Hybrid', false],
  ['hybrid[crepe+fcpe]', 'Hybrid: Crepe + FCPE', 'Median of two estimators', 'Hybrid', false],
  ['hybrid[rmvpe+fcpe]', 'Hybrid: RMVPE + FCPE', 'Median of two estimators', 'Hybrid', false],
  ['hybrid[crepe+rmvpe+fcpe]', 'Hybrid: Crepe + RMVPE + FCPE', 'Median of three estimators', 'Hybrid', false],
];

export const FALLBACK_F0_METHODS = definitions.map(([id, label, description, section, realtime]) => ({
  id, label, description, section, realtime, offline: true,
  available: false, reason: 'Waiting for server capabilities', components: [],
}));

export const F0_METHOD_IDS = FALLBACK_F0_METHODS.map(({ id }) => id);

export function normalizeF0Capabilities(value) {
  const supplied = new Map(
    (Array.isArray(value) ? value : [])
      .filter((item) => item && F0_METHOD_IDS.includes(item.id))
      .map((item) => [item.id, item])
  );
  return FALLBACK_F0_METHODS.map((fallback) => {
    const item = supplied.get(fallback.id);
    if (!item) return fallback;
    return {
      ...fallback,
      available: item.available === true,
      reason: typeof item.reason === 'string' ? item.reason : null,
      realtime: item.realtime === true,
      offline: item.offline === true,
      components: Array.isArray(item.components) ? item.components.filter((part) => F0_METHOD_IDS.includes(part)) : [],
    };
  });
}

export function groupedMethods(methods, mode = 'realtime') {
  const result = [];
  for (const method of methods || FALLBACK_F0_METHODS) {
    if (!method[mode]) continue;
    let group = result.find(({ section }) => section === method.section);
    if (!group) {
      group = { section: method.section, methods: [] };
      result.push(group);
    }
    group.methods.push(method);
  }
  return result;
}

export function findF0Method(methods, id) {
  return (methods || FALLBACK_F0_METHODS).find((method) => method.id === id)
    || FALLBACK_F0_METHODS.find((method) => method.id === id)
    || FALLBACK_F0_METHODS[0];
}
