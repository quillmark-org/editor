local g = import '../g.libsonnet';
local ds = import '../datasources.libsonnet';

local table = g.panel.table;

table.new('Documents Created Per User')
+ table.queryOptions.withDatasource(ds.postgres.type, ds.postgres.uid)
+ table.queryOptions.withTargets([
  {
    datasource: ds.postgres,
    rawSql: |||
      SELECT owner_id, COUNT(*) AS documents_created
      FROM documents
      WHERE created_at BETWEEN $__timeFrom() AND $__timeTo()
      GROUP BY owner_id
      ORDER BY documents_created DESC
    |||,
    format: 'table',
    refId: 'A',
  },
])
+ table.panelOptions.withGridPos(h=8, w=12, x=0, y=0)
