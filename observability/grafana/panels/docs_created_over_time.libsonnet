local g = import '../g.libsonnet';
local ds = import '../datasources.libsonnet';

local timeSeries = g.panel.timeSeries;

timeSeries.new('Documents Created Over Time')
+ timeSeries.queryOptions.withDatasource(ds.postgres.type, ds.postgres.uid)
+ timeSeries.queryOptions.withTargets([
  {
    datasource: ds.postgres,
    rawSql: |||
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS created
      FROM documents
      WHERE created_at BETWEEN $__timeFrom() AND $__timeTo()
      GROUP BY day
      ORDER BY day
    |||,
    format: 'time_series',
    refId: 'A',
  },
])
+ timeSeries.panelOptions.withGridPos(h=8, w=12, x=12, y=0)
