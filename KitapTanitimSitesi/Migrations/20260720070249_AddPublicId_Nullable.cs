using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KitapTanitimSitesi.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicId_Nullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PublicId",
                table: "Users",
                type: "nvarchar(9)",
                maxLength: 9,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_PublicId",
                table: "Users",
                column: "PublicId",
                unique: true,
                filter: "[PublicId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_PublicId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PublicId",
                table: "Users");
        }
    }
}
