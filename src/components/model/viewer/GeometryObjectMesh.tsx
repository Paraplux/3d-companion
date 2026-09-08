import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  Vector3,
} from "three";
import type { ModelGeometryObject } from "@/types/geometry";
import {
  loadPositionsBuffer,
  materialColorForObject,
  matrixFrom3mfTransform,
} from "@/lib/viewerMath";

type GeometryObjectMeshProps = {
  object: ModelGeometryObject;
  fallbackColor: string;
  centerToOrigin?: boolean;
  onReady?: () => void;
};

export function GeometryObjectMesh({
  object,
  fallbackColor,
  centerToOrigin = false,
  onReady,
}: GeometryObjectMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const signaledReadyRef = useRef(false);

  const matrix = useMemo(() => {
    if (object.transform && object.transform.length >= 12) {
      return matrixFrom3mfTransform(object.transform);
    }
    return new Matrix4();
  }, [object.transform]);

  const color = materialColorForObject(object, fallbackColor);

  useEffect(() => {
    signaledReadyRef.current = false;
  }, [object.positionsPath]);

  useEffect(() => {
    let disposed = false;
    let current: BufferGeometry | null = null;

    void loadPositionsBuffer(object.positionsPath)
      .then((positions) => {
        if (disposed) {
          return;
        }
        const next = new BufferGeometry();
        next.setAttribute("position", new BufferAttribute(positions, 3));
        if (centerToOrigin) {
          next.computeBoundingBox();
          const box = next.boundingBox;
          if (box) {
            const center = box.getCenter(new Vector3());
            next.translate(-center.x, -center.y, -box.min.z);
          }
        }
        next.computeVertexNormals();
        next.computeBoundingBox();
        current = next;
        setGeometry((existing) => {
          existing?.dispose();
          return next;
        });
      })
      .catch(() => {
        if (!disposed) {
          setGeometry((existing) => {
            existing?.dispose();
            return null;
          });
        }
      });

    return () => {
      disposed = true;
      current?.dispose();
      current = null;
    };
  }, [centerToOrigin, object.positionsPath]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !geometry) {
      return;
    }
    // Apply the full 3MF matrix directly — avoid decompose() on near-orthonormal
    // Bambu rotations (floating-point noise can look like a flip/scale glitch).
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.updateWorldMatrix(true, false);

    if (!signaledReadyRef.current) {
      signaledReadyRef.current = true;
      onReady?.();
    }
  }, [geometry, matrix, onReady]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh ref={meshRef} geometry={geometry} matrixAutoUpdate={false}>
      <meshStandardMaterial
        color={color}
        roughness={0.55}
        metalness={0.05}
        side={DoubleSide}
      />
    </mesh>
  );
}
