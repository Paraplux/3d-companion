type BuildPlateProps = {
  widthMm?: number;
  depthMm?: number;
  color: string;
  gridColor: string;
};

/**
 * Build plate in 3MF Z-up space (XY plane at Z≈0), before the scene Y-up rotation.
 */
export function BuildPlate({ widthMm, depthMm, color, gridColor }: BuildPlateProps) {
  const width = widthMm && widthMm > 0 ? widthMm : 220;
  const depth = depthMm && depthMm > 0 ? depthMm : 220;
  const known = Boolean(widthMm && depthMm);

  return (
    <group position={[width / 2, depth / 2, -0.15]}>
      <mesh rotation={[0, 0, 0]} receiveShadow={false}>
        <boxGeometry args={[width, depth, 0.3]} />
        <meshStandardMaterial
          color={color}
          roughness={0.9}
          metalness={0.02}
          transparent
          opacity={known ? 0.92 : 0.55}
        />
      </mesh>
      <gridHelper
        args={[Math.max(width, depth), 20, gridColor, gridColor]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.2]}
      />
    </group>
  );
}
