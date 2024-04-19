///
/// Copyright © 2016-2023 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { Component, Inject, OnInit, SkipSelf } from "@angular/core";
import {
  FormGroupDirective,
  NgForm,
  UntypedFormBuilder,
  UntypedFormControl,
  UntypedFormGroup,
  Validators,
} from "@angular/forms";
import { ErrorStateMatcher } from "@angular/material/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { Router } from "@angular/router";
import { AppState } from "@app/core/core.state";
import { AttributeService, TimeService } from "@app/core/public-api";
import {
  AggregationType,
  DAY,
  DataSortOrder,
  DialogComponent,
  EntityType,
  aggregationTranslations,
  calculateIntervalStartEndTime,
  quickTimeIntervalPeriod,
} from "@app/shared/public-api";
import { Store } from "@ngrx/store";
import moment from "moment";
import { ImportExportService } from "../import-export/import-export.service";

export interface DashboardDownloadDevicesTelemetryDialogData {
  dashboardName: string;
}

export enum DownloadTimeRangeType {
  FIXED,
  INTERVAL,
}

@Component({
  selector: "tb-dashboard-download-devices-telemetry-dialog",
  templateUrl: "./dashboard-download-devices-telemetry-dialog.component.html",
  styleUrls: ["./dashboard-download-devices-telemetry-dialog.component.scss"],
  providers: [
    {
      provide: ErrorStateMatcher,
      useExisting: DashboardDownloadDevicesTelemetryDialogComponent,
    },
  ],
})
export class DashboardDownloadDevicesTelemetryDialogComponent
  extends DialogComponent<
  DashboardDownloadDevicesTelemetryDialogComponent,
    void
  >
  implements OnInit, ErrorStateMatcher
{
  DownloadTimeRangeType = DownloadTimeRangeType;
  EntityType = EntityType;

  downloadDeviceTelemetriesFormGroup: UntypedFormGroup;
  loading = false;

  aggregationTypes = AggregationType;
  aggregations = Object.keys(AggregationType);
  aggregationTypesTranslations = aggregationTranslations;

  constructor(
    private attributeService: AttributeService,
    private importExport: ImportExportService,
    @Inject(MAT_DIALOG_DATA)
    public data: DashboardDownloadDevicesTelemetryDialogData,
    @SkipSelf() private errorStateMatcher: ErrorStateMatcher,
    protected store: Store<AppState>,
    protected router: Router,
    public dialogRef: MatDialogRef<DashboardDownloadDevicesTelemetryDialogComponent, void>,
    public fb: UntypedFormBuilder,
    private timeService: TimeService,
  ) {
    super(store, router, dialogRef);
  }

  ngOnInit(): void {
    this.downloadDeviceTelemetriesFormGroup = this.fb.group({
      deviceIds: [null, [Validators.required]],
      timeRange: this.fb.group({
        timeRangeType: [DownloadTimeRangeType.FIXED],
        fixedTimewindow: [null],
        quickInterval: [null],
      }),
      aggregation: [AggregationType.NONE, [Validators.required]],
      interval: [null],
      timezone: [null, [Validators.required]],
      limit: [100, [Validators.min(1)]],
    });
  }

  isErrorState(control: UntypedFormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    const originalErrorState = this.errorStateMatcher.isErrorState(control, form);
    const customErrorState = !!(control && control.invalid);
    return originalErrorState || customErrorState;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  async download() {
    let startTimeMs = this.downloadDeviceTelemetriesFormGroup.value.timeRange?.fixedTimewindow?.startTimeMs;
    let endTimeMs = this.downloadDeviceTelemetriesFormGroup.value.timeRange?.fixedTimewindow?.endTimeMs;
    if (this.downloadDeviceTelemetriesFormGroup.value.timeRange?.timeRangeType === DownloadTimeRangeType.INTERVAL) {
      const startEndTime = calculateIntervalStartEndTime(
        this.downloadDeviceTelemetriesFormGroup.value.timeRange?.quickInterval,
        this.downloadDeviceTelemetriesFormGroup.value.timezone
      );
      startTimeMs = startEndTime[0];
      endTimeMs = startEndTime[1];
    }

    this.loading = true;

    const keysOfDevices = await Promise.all(
      this.downloadDeviceTelemetriesFormGroup.value.deviceIds.map(
        (deviceId: string) =>
          this.attributeService.getEntityTimeSeriesKeys({
            entityType: EntityType.DEVICE,
            id: deviceId,
          })
          .toPromise()
      )
    );

    const dataOfDevices = await Promise.all(
      this.downloadDeviceTelemetriesFormGroup.value.deviceIds.map(
        (deviceId: string, index: number) =>
          keysOfDevices[index].length
            ? this.attributeService.getEntityTimeseries(
                { entityType: EntityType.DEVICE, id: deviceId },
                keysOfDevices[index],
                startTimeMs,
                endTimeMs,
                this.downloadDeviceTelemetriesFormGroup.value.limit,
                this.downloadDeviceTelemetriesFormGroup.value.aggregation,
                this.downloadDeviceTelemetriesFormGroup.value.aggregation === AggregationType.NONE
                  ? undefined
                  : this.downloadDeviceTelemetriesFormGroup.value.interval,
                DataSortOrder.ASC
              )
              .toPromise()
            : {}
      )
    );

    this.importExport.exportDevicesTelemetryData(
      `${this.data.dashboardName}_from_${moment(startTimeMs).format(
        "YYYYMMDD_HHmmss"
      )}_to_${moment(endTimeMs).format("YYYYMMDD_HHmmss")}`,
      this.downloadDeviceTelemetriesFormGroup.value.deviceIds.map(
        (id, index) => ({
          name: id,
          keys: keysOfDevices[index],
          data: dataOfDevices[index],
        })
      )
    );

    this.loading = false;
    this.cancel();
  }

  minAggInterval() {
    return this.timeService.minIntervalLimit(this.currentTimewindow());
  }

  maxAggInterval() {
    return this.timeService.maxIntervalLimit(this.currentTimewindow());
  }

  currentTimewindow(): number {
    const timeRangeFormValue = this.downloadDeviceTelemetriesFormGroup.value.timeRange;
    switch (timeRangeFormValue.timeRangeType) {
      case DownloadTimeRangeType.FIXED:
        return timeRangeFormValue.fixedTimewindow.endTimeMs - timeRangeFormValue.fixedTimewindow.startTimeMs;
      case DownloadTimeRangeType.INTERVAL:
        return quickTimeIntervalPeriod(timeRangeFormValue.quickInterval);
      default:
        return DAY;
    }
  }
}