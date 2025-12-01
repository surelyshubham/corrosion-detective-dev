# **App Name**: Corrosion Insights

## Core Features:

- Asset Type Selection: Select the type of asset from a dropdown menu. Options include Plate, Tank, Vessel, Pipe, Pipe Elbow, Ship Hull, and LPG/Gas Bullet.  This selection drives data processing parameters.
- Excel Data Upload and Parsing: Upload C-scan data in .xlsx format. The application will parse the Excel file, extracting metadata and thickness grid data.  Parsing implemented with excel-parser.ts.
- Data Processing and Analysis: Process the uploaded data to compute thickness deviation, percentage, and wall loss. Calculate global statistics such as min/max/avg thickness and corroded area percentages. Calculations implemented in data-processor.ts.
- 3D Visualization: Render a 3D model of the asset using the thickness data as a heightmap. Includes controls for Z scale, reference plane visibility, and camera angles. Min/Max thickness points highlighted.
- 2D Heatmap Visualization: Display a top-down 2D heatmap of the asset, with color-coded representation of thickness percentages. Interactive hover to show properties and selection linking to 3D view and data table.
- Data Table Display and Export: Show the raw data in a sortable and filterable table. Columns include x, y, thickness, deviation, percentage, and wallLoss. Allows export to Excel.
- AI-Powered Corrosion Insight Generation: Generates insights of the asset’s corrosion condition utilizing all available information. Based on global statistics of the loaded data the AI tool generates a recommendation, for example 'Condition: 🔥 Severe Localized Corrosion. Recommendation: Repair required'

## Style Guidelines:

- Primary color: Deep ocean blue (#29ABE2), suggestive of marine environments where corrosion is a common concern.
- Background color: Very light gray (#F0F2F5), offering a clean and professional backdrop.
- Accent color: Warm orange (#FF9933), for call-to-action elements and highlighting critical corrosion areas.
- Body font: 'Inter', sans-serif for clear data presentation and readability.
- Headline font: 'Space Grotesk', sans-serif for titles and headings. Emphasizes a modern tech-forward feel.
- Use simple, clear icons to represent different data types and functionalities, maintaining a technical aesthetic.
- Tab-based navigation with a clear separation of concerns for each view (Setup, 3D View, etc.).  Consistent spacing and alignment to ensure a professional and easy-to-navigate interface.