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
  selected,
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
      {/* 增加一个宽透明路径，方便鼠标hover/选中 */}
      <path
        d={edgePath}
        style={{ strokeWidth: 20, stroke: 'transparent', fill: 'none' }}
        className="react-flow__edge-interaction"
      />
      
      {/* 装饰层：底部白色/背景色描边，形成"切割"效果，增强层次感 */}
      <path
        d={edgePath}
        style={{
          strokeWidth: 4,
          stroke: 'hsl(var(--background))',
          fill: 'none',
          transition: 'all 0.3s ease',
        }}
      />
      
      {/* 主线条 */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected ? 2.5 : 1.5,
          stroke: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.6)',
          transition: 'all 0.3s ease',
          filter: selected ? 'drop-shadow(0 1px 2px hsl(var(--primary) / 0.3))' : undefined,
        }}
        id={id}
      />
    </>
  );
}
