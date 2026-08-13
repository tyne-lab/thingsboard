# AGENTS.md

## Về repo

Đây là bản **fork ThingsBoard của TYNE**. Toàn bộ source gốc đến từ dự án open-source
`thingsboard/thingsboard`; mọi thay đổi riêng của TYNE nằm trên các nhánh có tiền tố `tyne/`.

## Git remotes

| Remote | URL | Vai trò |
| --- | --- | --- |
| `upstream` | `git@github.com:thingsboard/thingsboard.git` | ThingsBoard bản gốc — chỉ dùng để fetch/đồng bộ, **không bao giờ push** |
| `origin` | `git@github.com:tyne-lab/thingsboard.git` | Repo của TYNE — nơi push mọi thay đổi |

## Quy ước nhánh

- Mọi nhánh của TYNE (trên `origin`) đều bắt đầu bằng `tyne/...`.
- Nhánh code chính: **`tyne/master`**.
- Nhánh release theo version: **`tyne/release/x.y.z`** (ví dụ `tyne/release/3.6.4`).
  `x.y.z` khớp với `<version>` trong [pom.xml](pom.xml).
- Các nhánh **không** có tiền tố `tyne/` (`master`, `develop/3.x`, `hotfix/3.x`, ...) là nhánh
  của ThingsBoard gốc, chỉ để đồng bộ với `upstream` — không commit trực tiếp lên chúng.

## Rule khi làm việc với git

1. Nhánh mới luôn base từ `tyne/master` (hoặc từ nhánh `tyne/release/x.y.z` tương ứng nếu là fix
   cho một version đã release) và đặt tên theo dạng `tyne/<loại>/<mô-tả>`, ví dụ
   `tyne/feature/...`, `tyne/fix/...`.
2. Push và mở PR luôn nhắm vào `origin`. Không tạo PR sang repo ThingsBoard gốc.
3. Khi cần lấy code mới từ ThingsBoard: `git fetch upstream`, rồi merge/rebase từ
   `upstream/<branch>` vào nhánh `tyne/...`. Không push ngược lên `upstream`.
4. Nếu không chắc đang đứng ở đâu, kiểm tra `git remote -v` và `git branch --show-current`
   trước khi push.

## Kiến trúc deploy

TYNE chạy ThingsBoard ở dạng **monolith**, service chính là **`tb-node`**
([msa/tb-node](msa/tb-node/)) — image này đã bao gồm luôn web UI và các transport (HTTP/MQTT/CoAP)
chạy trong cùng process.

Các module microservice khác trong [msa/](msa/) hiện **không dùng đến**:
`msa/tb`, `msa/web-ui`, `msa/vc-executor`, `msa/vc-executor-docker`, `msa/transport/*`,
`msa/js-executor`, `msa/monitoring`. Chúng vẫn nằm trong reactor của Maven nhưng CI cố tình bỏ qua
để build nhanh hơn. Nếu sau này cần tách microservice thì xem mục CI bên dưới.

## CI

- [.github/workflows/tyne-release-build.yml](.github/workflows/tyne-release-build.yml): chạy khi push
  lên `tyne/release/x.y.z` — build bằng JDK 17, tạo image `thingsboard/tb-node:x.y.z`, đổi tên thành
  `xuantruonglk02/tyne-tb-node:x.y.z` rồi push lên Docker Hub.
  Cần secrets `DOCKERHUB_USERNAME` và `DOCKERHUB_TOKEN`.
- Lệnh build trong workflow là `mvn clean install -DskipTests -Ddockerfile.skip=false -pl msa/tb-node -am`.
  `-pl msa/tb-node -am` giới hạn reactor ở tb-node cùng các module nó phụ thuộc
  (`common`, `dao`, `rule-engine`, `transport`, `ui-ngx`, `application`, ...).
  **Khi cần mở microservice**: bỏ `-pl msa/tb-node -am` để build toàn bộ image trong `msa/`, rồi thêm
  bước retag + push cho từng image cần dùng (`thingsboard/tb-web-ui`, `thingsboard/tb-http-transport`,
  `thingsboard/tb-mqtt-transport`, `thingsboard/tb-js-executor`, ...).
- `-Ddockerfile.skip=false` là bắt buộc: [msa/pom.xml](msa/pom.xml) mặc định đặt `dockerfile.skip=true`
  nên nếu không override thì Maven build xong mà không sinh image nào.
- Version của image lấy từ `<version>` trong [pom.xml](pom.xml); workflow có bước check version này
  khớp với `x.y.z` trong tên nhánh, lệch là fail sớm trước khi build.
- Các workflow còn lại trong [.github/workflows/](.github/workflows/) là của ThingsBoard gốc.

## Lưu ý khi thêm/sửa file

`mvn clean install` có chạy `license-maven-plugin:check`, nên các file `.yml`, `.java`, `.ts`, ...
mới thêm phải có header Apache theo [license-header-template.txt](license-header-template.txt)
(owner giữ nguyên là `The Thingsboard Authors`). File `.md` không bị check.
