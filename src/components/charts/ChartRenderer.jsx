import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui/Card';

const DEFAULT_COLORS = [
  '#1D9E75',
  '#378ADD',
  '#7F77DD',
  '#BA7517',
  '#E5534B',
  '#5DCAA5',
  '#484F58',
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-primary border border-border-default rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-text-primary mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-text-secondary">
          <span style={{ color: entry.color }} className="font-medium">
            {entry.name}:
          </span>{' '}
          {entry.value}
        </p>
      ))}
    </div>
  );
}

export function ChartRenderer({ chartData }) {
  if (!chartData) return null;

  const { type, title, labels, datasets } = chartData;

  const axisStyle = { fontSize: 11, fill: '#8B949E' };
  const gridStyle = { stroke: '#21262D', strokeDasharray: '3 3' };

  if (type === 'bar') {
    const data = labels.map((label, i) => {
      const point = { name: label };
      datasets.forEach((ds) => {
        point[ds.label] = ds.data[i];
      });
      return point;
    });

    return (
      <Card className="mt-3 p-3">
        <p className="text-xs font-semibold text-text-primary mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: '#30363D' }} />
            <YAxis tick={axisStyle} axisLine={{ stroke: '#30363D' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#8B949E' }} />
            {datasets.map((ds, i) => (
              <Bar
                key={ds.label}
                dataKey={ds.label}
                fill={ds.color || DEFAULT_COLORS[i]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  if (type === 'line') {
    const data = labels.map((label, i) => {
      const point = { name: label };
      datasets.forEach((ds) => {
        point[ds.label] = ds.data[i];
      });
      return point;
    });

    return (
      <Card className="mt-3 p-3">
        <p className="text-xs font-semibold text-text-primary mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: '#30363D' }} />
            <YAxis tick={axisStyle} axisLine={{ stroke: '#30363D' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#8B949E' }} />
            {datasets.map((ds, i) => (
              <Line
                key={ds.label}
                type="monotone"
                dataKey={ds.label}
                stroke={ds.color || DEFAULT_COLORS[i]}
                strokeWidth={2}
                dot={{ fill: ds.color || DEFAULT_COLORS[i], r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  if (type === 'pie') {
    const ds = datasets[0];
    const data = labels.map((label, i) => ({
      name: label,
      value: ds.data[i],
    }));
    const colors = ds.colors || DEFAULT_COLORS;

    return (
      <Card className="mt-3 p-3">
        <p className="text-xs font-semibold text-text-primary mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#484F58' }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  if (type === 'scatter') {
    const ds = datasets[0];
    const data = ds.data;
    return (
      <Card className="mt-3 p-3">
        <p className="text-xs font-semibold text-text-primary mb-3">{title}</p>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid {...gridStyle} />
            <XAxis dataKey="x" tick={axisStyle} axisLine={{ stroke: '#30363D' }} />
            <YAxis dataKey="y" tick={axisStyle} axisLine={{ stroke: '#30363D' }} />
            <Tooltip content={<CustomTooltip />} />
            <Scatter name={ds.label} data={data} fill={ds.color || DEFAULT_COLORS[0]} />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>
    );
  }

  return null;
}
