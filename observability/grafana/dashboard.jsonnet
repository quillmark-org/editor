local g = import 'g.libsonnet';

local docsCreatedPerUser = import 'panels/docs_created_per_user.libsonnet';
local docsCreatedOverTime = import 'panels/docs_created_over_time.libsonnet';
local docsExportedOverTime = import 'panels/docs_exported_over_time.libsonnet';
local dau = import 'panels/dau.libsonnet';
local wau = import 'panels/wau.libsonnet';

g.dashboard.new('TTQ Metrics')
+ g.dashboard.withUid('ttq-metrics')
+ g.dashboard.withDescription('TongueToQuill usage metrics — documents created, exports, and active users.')
+ g.dashboard.withTimezone('utc')
+ g.dashboard.withRefresh('30s')
+ g.dashboard.time.withFrom('now-7d')
+ g.dashboard.time.withTo('now')
+ g.dashboard.withEditable(true)
+ g.dashboard.withPanels([
  docsCreatedPerUser,
  docsCreatedOverTime,
  docsExportedOverTime,
  dau,
  wau,
])
