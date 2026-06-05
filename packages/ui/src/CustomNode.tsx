import { Handle, Position } from 'reactflow';

export default function CustomNode({ data }: { data: any }) {
  const label = data?.label || 'Unnamed Node';
  const kind = data?.kind || 'file';
  const status = data?.status || 'resolved';
  const focused = Boolean(data?.focused);

  return (
    <div
      title={data?.path || label}
      style={{
        width: 200,
        minHeight: 50,
        padding: '8px 12px',
        background: kind === 'ghost' ? '#3f1d1d' : '#1e293b',
        color: '#f8fafc',
        border: focused
          ? '2px solid #facc15'
          : kind === 'entry'
            ? '1px solid #38bdf8'
            : '1px solid #475569',
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
        textAlign: 'left',
      }}
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        id="in" 
        style={{ background: '#3b82f6' }} 
      />

      <div
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 700,
          lineHeight: 1.25,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          gap: 6,
          color: '#cbd5e1',
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        <span>{kind}</span>
        <span>{status}</span>
      </div>

      <Handle 
        type="source" 
        position={Position.Right} 
        id="out" 
        style={{ background: '#10b981' }} 
      />
    </div>
  );
}
