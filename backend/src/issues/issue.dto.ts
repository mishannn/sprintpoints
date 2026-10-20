import { IsPresentNullableString } from "../common/is-present-nullable-string.decorator";

export class ActiveIssueDto {
  @IsPresentNullableString()
  issueId: string | null;
}

export class NextActiveIssueDto {
  @IsPresentNullableString()
  nextActiveIssueId: string | null;
}
