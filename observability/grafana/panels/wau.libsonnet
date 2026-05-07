local g = import '../g.libsonnet';
local ds = import '../datasources.libsonnet';

local timeSeries = g.panel.timeSeries;

timeSeries.new('Weekly Active Users (WAU)')
+ timeSeries.queryOptions.withDatasource(ds.postgres.type, ds.postgres.uid)
+ timeSeries.queryOptions.withTargets([
  {
    datasource: ds.postgres,
    rawSql: |||
      SELECT date_trunc('week', date::timestamptz) AS week, COUNT(DISTINCT user_id) AS wau
      FROM user_activity
      WHERE date BETWEEN $__timeFrom()::date AND $__timeTo()::date
      GROUP BY week
      ORDER BY week
    |||,
    format: 'time_series',
    refId: 'A',
  },
])
+ timeSeries.panelOptions.withGridPos(h=8, w=24, x=0, y=16)
