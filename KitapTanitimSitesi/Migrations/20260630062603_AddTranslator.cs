using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KitapTanitimSitesi.Migrations
{
    /// <inheritdoc />
    public partial class AddTranslator : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Translators",
                columns: table => new
                {
                    TranslatorID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TranslatorName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TranslatorSurname = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Translators", x => x.TranslatorID);
                });

            migrationBuilder.CreateTable(
                name: "BookTranslators",
                columns: table => new
                {
                    BookID = table.Column<int>(type: "int", nullable: false),
                    TranslatorID = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookTranslators", x => new { x.BookID, x.TranslatorID });
                    table.ForeignKey(
                        name: "FK_BookTranslators_Books_BookID",
                        column: x => x.BookID,
                        principalTable: "Books",
                        principalColumn: "BookID",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BookTranslators_Translators_TranslatorID",
                        column: x => x.TranslatorID,
                        principalTable: "Translators",
                        principalColumn: "TranslatorID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookTranslators_TranslatorID",
                table: "BookTranslators",
                column: "TranslatorID");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookTranslators");

            migrationBuilder.DropTable(
                name: "Translators");
        }
    }
}
