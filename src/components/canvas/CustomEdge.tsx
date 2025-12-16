import { BaseEdge, EdgeProps, getBezierPath } from 'reactflow';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* 增加一个宽一点的透明路径，方便鼠标hover/选中 */}
      <path
        d={edgePath}
        style={{ strokeWidth: 20, stroke: 'transparent', fill: 'none' }}
      />
      
      {/* 底部光晕/阴影 */}
      <path
        d={edgePath}
        style={{
          ...style,
          strokeWidth: 4,
          stroke: 'hsl(var(--primary))',
          opacity: 0.15,
          fill: 'none',
        }}
      />
      
      {/* 主线条 */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        id={id}
      />
    </>
  );
}
