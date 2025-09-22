
"use client"

import { AppLayout } from "@/components/layout/app-layout"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { BarChart, Bar, XAxis, CartesianGrid, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

const chartData = [
  { month: "January", points: 1860 },
  { month: "February", points: 3050 },
  { month: "March", points: 2370 },
  { month: "April", points: 730 },
  { month: "May", points: 2090 },
  { month: "June", points: 2140 },
]

const chartConfig = {
  points: {
    label: "Points Awarded",
    color: "hsl(var(--primary))",
  },
}


export default function AnalyticsPage() {
  return (
    <AppLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Community Analytics
          </h1>
          <p className="text-muted-foreground">
            Track engagement, growth, and points distribution in your community.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
           <Card>
            <CardHeader>
                <CardTitle>Total Points Awarded</CardTitle>
                <CardDescription>January - June 2024</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart accessibilityLayer data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 3)}
                  />
                   <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Bar dataKey="points" fill="var(--color-points)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
             <CardHeader>
                <CardTitle>More Analytics Coming Soon</CardTitle>
             </CardHeader>
             <CardContent>
                <p className="text-muted-foreground">
                    The foundation for tracking points and events is now in place. We&apos;re working on a more comprehensive analytics dashboard to provide deeper insights into your community&apos;s health and engagement. Stay tuned!
                </p>
             </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}

