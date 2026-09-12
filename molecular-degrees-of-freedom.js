const translations = [
  ['tx', '沿 x 平移', [1, 0, 0]],
  ['ty', '沿 y 平移', [0, 1, 0]],
  ['tz', '沿 z 平移', [0, 0, 1]],
].map(([id, label, axis]) => ({ id, label, axis, kind: 'translation', visible: 1, equipartition: 1 }));

const mode = (id, label, kind, visible, equipartition, description, axis = null) => ({
  id, label, kind, visible, equipartition, description, axis,
});

export const MOLECULES = {
  monoatomic: {
    label: '單原子',
    atoms: [{ element: 'Ne', base: [0, 0, 0] }],
    modes: translations,
  },
  diatomic: {
    label: '雙原子',
    atoms: [{ element: 'A', base: [-.95, 0, 0] }, { element: 'B', base: [.95, 0, 0] }],
    modes: [
      ...translations,
      mode('ry', '繞 y 軸轉動', 'rotation', 1, 1, '分子軸在 x 方向，繞 y 軸的方向可獨立指定。', [0, 1, 0]),
      mode('rz', '繞 z 軸轉動', 'rotation', 1, 1, '分子軸在 x 方向，繞 z 軸的方向可獨立指定。', [0, 0, 1]),
      mode('stretch', '鍵長伸縮振動', 'vibration', 1, 2, '同一正規模態有動能與位能兩個二次項。'),
    ],
  },
  'linear-triatomic': {
    label: '線型三原子',
    atoms: [{ element: 'O', base: [-1.25, 0, 0] }, { element: 'C', base: [0, 0, 0] }, { element: 'O', base: [1.25, 0, 0] }],
    modes: [
      ...translations,
      mode('ry', '繞 y 軸轉動', 'rotation', 1, 1, '線型分子的剛體轉動。', [0, 1, 0]),
      mode('rz', '繞 z 軸轉動', 'rotation', 1, 1, '線型分子的剛體轉動。', [0, 0, 1]),
      mode('symmetric-stretch', '對稱伸縮', 'vibration', 1, 2, '兩端原子相對中心原子同步伸縮。'),
      mode('antisymmetric-stretch', '非對稱伸縮', 'vibration', 1, 2, '兩端原子反向改變鍵長。'),
      mode('bend-degenerate', '彎曲振動（雙重退化）', 'vibration', 2, 4, '可沿 y 和 z 的兩個獨立方向彎曲。'),
    ],
  },
};

export function getPresetModeIds(moleculeId, preset) {
  const modes = MOLECULES[moleculeId].modes;
  return modes
    .filter((item) => preset === 'translation'
      ? item.kind === 'translation'
      : preset === 'rigid' ? item.kind !== 'vibration' : true)
    .map((item) => item.id);
}

export function summarizeModes(moleculeId, enabledIds) {
  const enabledModes = MOLECULES[moleculeId].modes.filter((item) => enabledIds.includes(item.id));
  const parts = ['translation', 'rotation', 'vibration']
    .map((kind) => ({
      kind,
      visible: enabledModes.filter((item) => item.kind === kind).reduce((n, item) => n + item.visible, 0),
      equipartition: enabledModes.filter((item) => item.kind === kind).reduce((n, item) => n + item.equipartition, 0),
    }))
    .filter((item) => item.visible > 0);
  return {
    visibleCount: parts.reduce((n, item) => n + item.visible, 0),
    equipartitionF: parts.reduce((n, item) => n + item.equipartition, 0),
    parts,
    enabledModes,
  };
}

const addScaled = (position, vector, scale) => {
  position[0] += vector[0] * scale;
  position[1] += vector[1] * scale;
  position[2] += vector[2] * scale;
};

function rotateY([x, y, z], angle) {
  return [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)];
}

function rotateZ([x, y, z], angle) {
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
}

/** Return deterministic atom positions after the selected normal modes evolve at time. */
export function getAtomPositions(moleculeId, enabledIds, time) {
  const molecule = MOLECULES[moleculeId];
  const enabledModes = molecule.modes.filter((item) => enabledIds.includes(item.id));
  const positions = molecule.atoms.map(({ element, base }) => ({ element, position: [...base] }));

  for (const item of enabledModes) {
    const oscillation = Math.sin(time + item.id.length * 0.37);
    if (item.kind === 'translation') {
      for (const atom of positions) addScaled(atom.position, item.axis, 0.22 * oscillation);
    }
  }

  const rotationModes = enabledModes.filter((item) => item.kind === 'rotation');
  for (const item of rotationModes) {
    const angle = 0.18 * Math.sin(time + item.id.length * 0.37);
    for (const atom of positions) {
      atom.position = item.id === 'ry' ? rotateY(atom.position, angle) : rotateZ(atom.position, angle);
    }
  }

  const stretch = enabledModes.find((item) => item.id === 'stretch');
  if (stretch) {
    const amount = 0.2 * Math.sin(time + 1.1);
    positions.forEach((atom, index) => { atom.position[0] += (index === 0 ? -1 : 1) * amount; });
  }
  const symmetric = enabledModes.find((item) => item.id === 'symmetric-stretch');
  if (symmetric) {
    const amount = 0.16 * Math.sin(time + 0.8);
    positions.forEach((atom, index) => { if (index !== 1) atom.position[0] += (index === 0 ? -1 : 1) * amount; });
  }
  const antisymmetric = enabledModes.find((item) => item.id === 'antisymmetric-stretch');
  if (antisymmetric) {
    const amount = 0.16 * Math.sin(time + 1.6);
    positions.forEach((atom, index) => { if (index !== 1) atom.position[0] -= amount; });
  }
  const bend = enabledModes.find((item) => item.id === 'bend-degenerate');
  if (bend) {
    const amountY = 0.18 * Math.sin(time + 0.4);
    const amountZ = 0.18 * Math.sin(time + 1.2);
    positions.forEach((atom, index) => {
      if (index !== 1) {
        atom.position[1] += amountY;
        atom.position[2] += amountZ;
      }
    });
  }

  return positions.map(({ element, position: [x, y, z] }) => ({ x, y, z, element }));
}
