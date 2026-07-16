import type { ComputeChartResponse, Scope } from "@ruckmetrics/contracts";
import { Warnings } from "./Warnings";
import { ScatterChart } from "./ScatterChart";
import { StripChart } from "./StripChart";
import { RadarChart } from "./RadarChart";
import { BarChart } from "./BarChart";

interface Props {
  response: ComputeChartResponse;
  scope: Scope;
}

/** Does this response carry any data for its chart type? */
function isEmpty(r: ComputeChartResponse): boolean {
  switch (r.chartType) {
    case "radar":
    case "groupedBar":
      return r.categorySeries.length === 0;
    case "stackedBar":
      return r.stackSeries.length === 0;
    case "scatter":
      return r.points.filter((p) => p.y !== null).length === 0;
    case "strip":
      return r.points.length === 0;
  }
}

/**
 * THE render dispatcher. It reads response.chartType (which the engine derived
 * from the ChartDefinition) and renders the matching hand-rolled SVG chart.
 * Warnings always render above the chart; a fully empty result falls back to an
 * explanatory empty state built from those warnings.
 */
export function ChartCanvas({ response, scope }: Props) {
  const empty = isEmpty(response);

  return (
    <div className="canvas">
      <Warnings warnings={response.warnings} />

      {empty ? (
        <div className="empty-state">
          <h3>No data to plot</h3>
          {response.warnings.length > 0 ? (
            <p>
              This view is empty — see the notice{response.warnings.length > 1 ? "s" : ""} above.
              Presets built on paid metrics stay wired and ready but render empty until a paid
              adapter lands.
            </p>
          ) : (
            <p>The cohort returned no subjects for this configuration.</p>
          )}
        </div>
      ) : response.chartType === "scatter" ? (
        <ScatterChart response={response} scope={scope} />
      ) : response.chartType === "strip" ? (
        <StripChart response={response} scope={scope} />
      ) : response.chartType === "radar" ? (
        <RadarChart response={response} />
      ) : (
        <BarChart response={response} />
      )}
    </div>
  );
}
