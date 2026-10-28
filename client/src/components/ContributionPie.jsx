
import { PieChart, Pie, Tooltip, Legend, Cell, ResponsiveContainer } from "recharts";

const COLORS = [
  "#8884d8", 
  "#82ca9d", 
  "#ffc658", 
  "#ff8042", 
  "#00C49F", 
  "#0088FE", 
  "#A28FD0",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1"
];

export default function ContributionPie({ data = [] }) {
  // Transform data for the chart
  const chartData = data.map((d) => ({
    name: d.name,
    value: Math.max(0, d.speakingMs ?? d.speakingTime ?? d.value ?? 0),
  }));

  // Check if there's any data
  const hasNonZero = chartData.some((c) => c.value > 0);
  const finalData = hasNonZero ? chartData : [{ name: "No data yet", value: 1 }];

  // Custom label formatter
  const renderLabel = (entry) => {
    if (entry.name === "No data yet") return "";
    const seconds = Math.round(entry.value / 1000);
    return `${entry.name}: ${seconds}s`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      if (data.name === "No data yet") return null;
      
      const seconds = Math.round(data.value / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-semibold text-gray-800">{data.name}</p>
          <p className="text-sm text-gray-600">
            {minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`}
          </p>
          {data.payload.percent && (
            <p className="text-xs text-gray-500">{data.payload.percent}%</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <h3 className="font-semibold text-lg mb-4 text-gray-800">
        Speaking Time Contribution
      </h3>
      
      {!hasNonZero && (
        <p className="text-sm text-gray-500 text-center mb-4">
          Speaking time appears here automatically once the discussion starts.
        </p>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={finalData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={hasNonZero ? renderLabel : false}
            labelLine={hasNonZero}
          >
            {finalData.map((entry, idx) => (
              <Cell 
                key={`cell-${idx}`} 
                fill={COLORS[idx % COLORS.length]}
                opacity={entry.name === "No data yet" ? 0.3 : 1}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          {hasNonZero && <Legend />}
        </PieChart>
      </ResponsiveContainer>

      {/* Summary statistics */}
      {hasNonZero && (
        <div className="mt-4 space-y-2">
          {chartData
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value)
            .map((d, idx) => {
              const total = chartData.reduce((sum, item) => sum + item.value, 0);
              const percent = total > 0 ? Math.round((d.value / total) * 100) : 0;
              const seconds = Math.round(d.value / 1000);
              
              return (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[chartData.indexOf(d) % COLORS.length] }}
                    />
                    <span className="font-medium">{d.name}</span>
                  </div>
                  <div className="text-gray-600">
                    {seconds}s ({percent}%)
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}