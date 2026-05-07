local g = import '../g.libsonnet';
local ds = import '../datasources.libsonnet';

local timeSeries = g.panel.timeSeries;

timeSeries.new('Daily Active Users (DAU)')
+ timeSeries.queryOptions.withDatasource(ds.postgres.type, ds.postgres.uid)
+ timeSeries.queryOptions.withTargets([
  {
    datasource: ds.postgres,
    rawSql: |||
      SELECT date, COUNT(DISTINCT user_id) AS dau
      FROM user_activity
      WHERE date BETWEEN $__timeFrom()::date AND $__timeTo()::date
      GROUP BY date
      ORDER BY date
    |||,
    format: 'time_series',
    refId: 'A',
  },
])
+ timeSeries.panelOptions.withGridPos(h=8, w=12, x=12, y=8)
