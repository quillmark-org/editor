local g = import '../g.libsonnet';
local ds = import '../datasources.libsonnet';

local timeSeries = g.panel.timeSeries;

timeSeries.new('Documents Exported Over Time')
+ timeSeries.queryOptions.withDatasource(ds.postgres.type, ds.postgres.uid)
+ timeSeries.queryOptions.withTargets([
  {
    datasource: ds.postgres,
    rawSql: |||
      SELECT day, SUM(count) AS exports
      FROM document_export_counts
      WHERE day BETWEEN $__timeFrom()::date AND $__timeTo()::date
      GROUP BY day
      ORDER BY day
    |||,
    format: 'time_series',
    refId: 'A',
  },
])
+ timeSeries.panelOptions.withGridPos(h=8, w=12, x=0, y=8)
