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
import { ImportExportService } from "@app/shared/import-export/import-export.service";
import {
  AggregationType,
  DataSortOrder,
  DialogComponent,
  EntityType,
  aggregationTranslations,
} from "@app/shared/public-api";
import { Store } from "@ngrx/store";
import moment from "moment";

export interface DeviceDownloadTelemetryDataDialogData {
  deviceId: string;
  name: string;
}

@Component({
  selector: "tb-device-download-telemetry-data-dialog",
  templateUrl: "./device-download-telemetry-data-dialog.component.html",
  providers: [
    {
      provide: ErrorStateMatcher,
      useExisting: DeviceDownloadTelemetryDataDialogComponent,
    },
  ],
})
export class DeviceDownloadTelemetryDataDialogComponent
  extends DialogComponent<DeviceDownloadTelemetryDataDialogComponent, void>
  implements OnInit, ErrorStateMatcher
{
  downloadTelemetryFormGroup: UntypedFormGroup;
  loading = true;
  
  aggregationTypes = AggregationType;
  aggregations = Object.keys(AggregationType);
  aggregationTypesTranslations = aggregationTranslations;

  constructor(
    protected store: Store<AppState>,
    protected router: Router,
    @Inject(MAT_DIALOG_DATA) public data: DeviceDownloadTelemetryDataDialogData,
    @SkipSelf() private errorStateMatcher: ErrorStateMatcher,
    private attributeService: AttributeService,
    private importExportService: ImportExportService,
    public dialogRef: MatDialogRef<DeviceDownloadTelemetryDataDialogComponent,void>,
    public fb: UntypedFormBuilder,
    private timeService: TimeService,
  ) {
    super(store, router, dialogRef);
  }

  ngOnInit(): void {
    this.downloadTelemetryFormGroup = this.fb.group({
      keys: [null],
      timeRange: [null, [Validators.required]],
      aggregation: [AggregationType.NONE, [Validators.required]],
      interval: [null],
      timezone: [null, [Validators.required]],
      limit: [100, [Validators.min(1)]],
    });
    this.loadDeviceTelemetryKeys();
  }

  loadDeviceTelemetryKeys() {
    this.attributeService
      .getEntityTimeSeriesKeys({
        entityType: EntityType.DEVICE,
        id: this.data.deviceId,
      })
      .subscribe((keys: Array<string>) => {
        this.downloadTelemetryFormGroup.patchValue({
          keys: keys,
        });
        this.loading = false;
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

  download(): void {
    const formValue = this.downloadTelemetryFormGroup.getRawValue();
    const keys = formValue.keys;
    const startTimeMs = formValue.timeRange.startTimeMs;
    const endTimeMs = formValue.timeRange.endTimeMs;
    const aggregation = formValue.aggregation;
    const interval = formValue.interval;
    const limit = formValue.limit;
    this.loading = true;

    this.attributeService
      .getEntityTimeseries(
        { entityType: EntityType.DEVICE, id: this.data.deviceId },
        keys,
        startTimeMs,
        endTimeMs,
        limit,
        aggregation,
        aggregation === AggregationType.NONE
          ? undefined
          : interval,
        DataSortOrder.ASC
      )
      .subscribe((data) => {
        this.importExportService.exportDevicesTelemetryData(
          `${this.data.name}_from_${moment(startTimeMs).format(
            "YYYYMMDD_HHmmss"
          )}_to_${moment(endTimeMs).format("YYYYMMDD_HHmmss")}`,
          [
            {
              name: this.data.name,
              keys: keys,
              data,
            },
          ]
        );
        this.loading = false;
        this.cancel();
      });
  }

  minAggInterval() {
    return this.timeService.minIntervalLimit(this.currentTimewindow());
  }

  maxAggInterval() {
    return this.timeService.maxIntervalLimit(this.currentTimewindow());
  }

  currentTimewindow(): number {
    const timeRangeFormValue = this.downloadTelemetryFormGroup.value.timeRange;
    return timeRangeFormValue.endTimeMs - timeRangeFormValue.startTimeMs;
  }
}
