import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** The sidebar groups above a page, then the page. Groups have no page of their own. */
export function PageBreadcrumb({
  trail,
  page,
}: {
  trail: string[];
  page: string;
}): React.JSX.Element {
  return (
    <Breadcrumb>
      <BreadcrumbList className="m-0 list-none p-0">
        {trail.map((label) => (
          <Fragment key={label}>
            <BreadcrumbItem>{label}</BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium">{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
